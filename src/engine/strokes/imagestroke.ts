// Ports of rnote-engine strokes/bitmapimage.rs and vectorimage.rs.
// Raster images are drawn from an HTMLImageElement; SVG vector images keep
// their source and rasterise through an Image as well (editable as data).

import { Vec2, Aabb, Transform } from '../../compose/geometry'
import { Color } from '../../compose/style/color'
import { StrokeLayer } from '../../compose/style/options'
import type { Stroke, StrokeHitContext, StrokeJSON } from './stroke'
import { nextStrokeId } from './next-id'
import { gestureState } from '../render/gestureState'

const imageCache = new Map<string, HTMLImageElement>()
// Called when a lazily-loaded image finishes decoding, so the scene can pick
// it up even while the camera is otherwise idle.
let frameNotifier: (() => void) | null = null
export function setImageFrameNotifier(fn: (() => void) | null) {
  frameNotifier = fn
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src)
  if (cached && cached.complete && cached.naturalWidth) return Promise.resolve(cached)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      imageCache.set(src, img)
      resolve(img)
    }
    img.onerror = reject
    img.src = src
  })
}

export class BitmapImageStroke implements Stroke {
  kind = 'bitmap' as const
  id: number
  dataUrl: string
  // rectangle in document coordinates
  rect: Aabb
  // native pixel dimensions
  pixelWidth: number
  pixelHeight: number
  layer = StrokeLayer.Image
  image: HTMLImageElement | null = null
  private loading = false
  opacity = 1

  constructor(dataUrl: string, rect: Aabb, pixelWidth: number, pixelHeight: number, id?: number) {
    this.id = id ?? nextStrokeId()
    this.dataUrl = dataUrl
    this.rect = rect
    this.pixelWidth = pixelWidth
    this.pixelHeight = pixelHeight
    // Decode is deferred until the image first enters the viewport (see draw).
  }

  private ensureImage() {
    if (this.image || this.loading) return
    this.loading = true
    loadImage(this.dataUrl)
      .then((img) => {
        this.image = img
        frameNotifier?.()
      })
      .catch(() => undefined)
  }

  static async create(dataUrl: string, topLeft: Vec2): Promise<BitmapImageStroke> {
    const img = await loadImage(dataUrl)
    const rect = new Aabb(topLeft.clone(), topLeft.add(new Vec2(img.naturalWidth, img.naturalHeight)))
    return new BitmapImageStroke(dataUrl, rect, img.naturalWidth, img.naturalHeight)
  }

  bounds(): Aabb {
    return this.rect
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.ensureImage()
    if (!this.image || !this.image.complete) return
    ctx.save()
    ctx.globalAlpha = this.opacity
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(this.image, this.rect.min.x, this.rect.min.y, this.rect.width(), this.rect.height())
    ctx.restore()
  }

  toSVG(): string {
    return `<image x="${r(this.rect.min.x)}" y="${r(this.rect.min.y)}" width="${r(this.rect.width())}" height="${r(this.rect.height())}" href="${this.dataUrl}"/>`
  }

  translate(d: Vec2) {
    this.rect = this.rect.translate(d)
  }
  transform(t: Transform) {
    this.rect = this.rect.transform(t)
  }
  hitTest(p: Vec2, _c: StrokeHitContext): boolean {
    return this.rect.extend_by(4).contains(p)
  }
  intersectsAabb(box: Aabb): boolean {
    return box.intersects(this.rect)
  }
  invertColors() {
    // images keep their colours
  }
  duplicate(): Stroke {
    const copy = new BitmapImageStroke(this.dataUrl, this.rect.clone(), this.pixelWidth, this.pixelHeight)
    copy.layer = this.layer
    copy.opacity = this.opacity
    return copy
  }

  toJSON(): StrokeJSON {
    return {
      id: this.id,
      kind: 'bitmap',
      data_url: this.dataUrl,
      rect: { min: { x: this.rect.min.x, y: this.rect.min.y }, max: { x: this.rect.max.x, y: this.rect.max.y } },
      pixel_width: this.pixelWidth,
      pixel_height: this.pixelHeight,
      opacity: this.opacity,
      layer: this.layer
    }
  }

  static fromJSON(o: any): BitmapImageStroke {
    const rect = new Aabb(new Vec2(o.rect.min.x, o.rect.min.y), new Vec2(o.rect.max.x, o.rect.max.y))
    const s = new BitmapImageStroke(o.data_url, rect, o.pixel_width ?? 0, o.pixel_height ?? 0, o.id)
    s.opacity = o.opacity ?? 1
    s.layer = o.layer ?? StrokeLayer.Image
    return s
  }
}

const RASTER_LIMIT = 4096

export class VectorImageStroke implements Stroke {
  kind = 'vector' as const
  id: number
  svgSource: string
  dataUrl: string
  rect: Aabb
  layer = StrokeLayer.Image
  opacity = 1
  image: HTMLImageElement | null = null
  private loading = false
  // adaptive raster cache so an SVG stays crisp when zoomed / exported at DPI
  private raster: HTMLCanvasElement | null = null
  private rasterScale = 0

  constructor(svgSource: string, rect: Aabb, id?: number) {
    this.id = id ?? nextStrokeId()
    this.svgSource = svgSource
    this.rect = rect
    this.dataUrl = svgToDataUrl(svgSource)
    // Decode deferred until the image enters the viewport (see draw).
  }

  private ensureImage() {
    if (this.image || this.loading) return
    this.loading = true
    loadImage(this.dataUrl)
      .then((img) => {
        this.image = img
        this.raster = null
        this.rasterScale = 0
        frameNotifier?.()
      })
      .catch(() => undefined)
  }

  static async create(svgSource: string, topLeft: Vec2): Promise<VectorImageStroke> {
    const url = svgToDataUrl(svgSource)
    const img = await loadImage(url)
    const rect = new Aabb(topLeft.clone(), topLeft.add(new Vec2(img.naturalWidth || 300, img.naturalHeight || 300)))
    return new VectorImageStroke(svgSource, rect, undefined)
  }

  bounds(): Aabb {
    return this.rect
  }

  // Re-rasterise the SVG at the on-device pixel size it occupies, so zooming in
  // or high-DPI / print export never shows a scaled-up bitmap (lossless vector).
  private ensureRaster(effScale: number): HTMLCanvasElement | null {
    if (!this.image || !this.image.complete) return null
    const wDoc = this.rect.width()
    const hDoc = this.rect.height()
    const targetW = Math.min(RASTER_LIMIT, Math.max(1, Math.round(wDoc * effScale)))
    const targetH = Math.min(RASTER_LIMIT, Math.max(1, Math.round(hDoc * effScale)))
    // bucket the scale to avoid re-rasterising every frame
    const bucket = Math.ceil(effScale * 2) / 2
    // Reuse the current sprite while a zoom gesture is active (drawn scaled,
    // slightly soft); it re-rasterises once the gesture settles.
    if (this.raster && gestureState.zooming) return this.raster
    if (this.raster && this.rasterScale >= bucket) return this.raster
    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const c = canvas.getContext('2d')
    if (!c) return this.raster
    c.drawImage(this.image, 0, 0, targetW, targetH)
    this.raster = canvas
    this.rasterScale = bucket
    return canvas
  }

  draw(ctx: CanvasRenderingContext2D, zoom = 1) {
    this.ensureImage()
    if (!this.image || !this.image.complete) return
    ctx.save()
    ctx.globalAlpha = this.opacity
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    // effective device scale = dpr * zoom, read from the current transform
    const m = ctx.getTransform()
    const eff = Math.hypot(m.a, m.b) || zoom
    const source = this.ensureRaster(Math.max(eff, 1))
    const drawable: CanvasImageSource = source ?? this.image
    ctx.drawImage(drawable, this.rect.min.x, this.rect.min.y, this.rect.width(), this.rect.height())
    ctx.restore()
  }

  toSVG(): string {
    // Inline the original, resolution-independent SVG (true vector export)
    // instead of wrapping a rasterised <image>.
    const inlined = inlineSvg(this.svgSource, this.rect)
    if (inlined) return inlined
    return `<image x="${r(this.rect.min.x)}" y="${r(this.rect.min.y)}" width="${r(this.rect.width())}" height="${r(this.rect.height())}" href="${this.dataUrl}"/>`
  }
  translate(d: Vec2) {
    this.rect = this.rect.translate(d)
  }
  transform(t: Transform) {
    this.rect = this.rect.transform(t)
  }
  hitTest(p: Vec2, _c: StrokeHitContext): boolean {
    return this.rect.extend_by(4).contains(p)
  }
  intersectsAabb(box: Aabb): boolean {
    return box.intersects(this.rect)
  }
  invertColors() {}
  duplicate(): Stroke {
    const copy = new VectorImageStroke(this.svgSource, this.rect.clone())
    copy.layer = this.layer
    copy.opacity = this.opacity
    return copy
  }
  toJSON(): StrokeJSON {
    return {
      id: this.id,
      kind: 'vector',
      svg_source: this.svgSource,
      rect: { min: { x: this.rect.min.x, y: this.rect.min.y }, max: { x: this.rect.max.x, y: this.rect.max.y } },
      opacity: this.opacity,
      layer: this.layer
    }
  }
  static fromJSON(o: any): VectorImageStroke {
    const rect = new Aabb(new Vec2(o.rect.min.x, o.rect.min.y), new Vec2(o.rect.max.x, o.rect.max.y))
    const s = new VectorImageStroke(o.svg_source, rect, o.id)
    s.opacity = o.opacity ?? 1
    s.layer = o.layer ?? StrokeLayer.Image
    return s
  }
}

// Wrap an SVG document into a nested <svg> positioned at the stroke rectangle,
// preserving its viewBox so it scales losslessly. Returns null if parsing fails.
function inlineSvg(svgSource: string, rect: Aabb): string | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(svgSource, 'image/svg+xml')
    const root = doc.querySelector('svg')
    if (!root) return null
    const w = rect.width()
    const h = rect.height()
    let viewBox = root.getAttribute('viewBox')
    if (!viewBox) {
      const ow = parseFloat(root.getAttribute('width') || '') || w
      const oh = parseFloat(root.getAttribute('height') || '') || h
      viewBox = `0 0 ${ow} ${oh}`
    }
    const inner = root.innerHTML
    return (
      `<svg x="${r(rect.min.x)}" y="${r(rect.min.y)}" width="${r(w)}" height="${r(h)}" ` +
      `viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`
    )
  } catch {
    return null
  }
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function r(v: number): number {
  return Math.round(v * 100) / 100
}

export { Color }
