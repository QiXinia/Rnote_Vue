// Port of rnote-engine strokes/brushstroke.rs.

import { Vec2, Aabb, Transform } from '../../compose/geometry'
import { PenPath } from '../../compose/penpath/penpath'
import { SmoothOptions, MarkerOptions, TexturedOptions, StrokeLayer } from '../../compose/style/options'
import {
  buildSmoothPath,
  buildTexturedPath,
  brushStrokeSVG,
  texturedBrushSVG
} from '../../compose/style/brush-render'
import type { Stroke, StrokeHitContext, StrokeJSON } from './stroke'
import { nextStrokeId } from './next-id'
import { gestureState } from '../render/gestureState'

export enum BrushStyleKind {
  Marker = 'marker',
  Solid = 'solid',
  Textured = 'textured'
}

const BRUSH_RASTER_LIMIT = 4096

export class BrushStroke implements Stroke {
  kind = 'brush' as const
  id: number
  penPath: PenPath
  styleKind: BrushStyleKind
  smooth: SmoothOptions
  textured: TexturedOptions
  layer: StrokeLayer = StrokeLayer.UserLayer
  // Cached document-space filled outline; rebuilt only when the element count
  // changes (active stroke) or after a transform. Zoom/DPR independent.
  private cachedPath: Path2D | null = null
  private cachedLen = -1
  private cachedBounds: Aabb | null = null
  // Zoom-bucketed raster sprite. Panning is a cheap drawImage; the sprite is
  // re-rasterised from the vector outline only when the device pixel scale
  // crosses a bucket, so zooming stays crisp (mirrors VectorImageStroke).
  private raster: HTMLCanvasElement | null = null
  private rasterScale = 0

  constructor(
    penPath: PenPath,
    styleKind: BrushStyleKind,
    smooth: SmoothOptions,
    textured: TexturedOptions,
    id?: number
  ) {
    this.id = id ?? nextStrokeId()
    this.penPath = penPath
    this.styleKind = styleKind
    this.smooth = smooth
    this.textured = textured
    this.layer = styleKind === BrushStyleKind.Marker ? StrokeLayer.Highlighter : StrokeLayer.UserLayer
    // Desktop fits the captured elements into bezier segments when the stroke
    // is completed; do it here so every BrushStroke stores the authoritative,
    // lossless path (a path already fitted from a native file is left as-is).
    if (!this.penPath.fitted) this.penPath.fit(this.penPath.builderType)
  }

    get width(): number {
    return this.styleKind === BrushStyleKind.Textured ? this.textured.stroke_width : this.smooth.stroke_width
  }

  bounds(): Aabb {
    if (!this.cachedBounds) this.cachedBounds = this.penPath.hitbox(this.width + 4)
    return this.cachedBounds
  }

  private ensureOutline(): Path2D | null {
    const len = this.penPath.elements.length
    if (!this.cachedPath || this.cachedLen !== len) {
      this.cachedPath =
        this.styleKind === BrushStyleKind.Textured
          ? buildTexturedPath(this.penPath, this.textured)
          : buildSmoothPath(this.penPath, this.smooth, this.styleKind === BrushStyleKind.Marker)
      this.cachedLen = len
      this.raster = null
    }
    return this.cachedPath
  }

  private strokeColor() {
    return this.styleKind === BrushStyleKind.Textured ? this.textured.stroke_color : this.smooth.stroke_color
  }

  private ensureRaster(eff: number, allowUpgrade = false): HTMLCanvasElement | null {
    const path = this.cachedPath
    if (!path) return null
    const b = this.bounds()
    const bucket = Math.ceil(eff * 2) / 2
    // While a zoom gesture is active, keep the existing sprite (it gets scaled,
    // possibly slightly soft) instead of re-rasterising every frame. The sprite
    // is rebuilt at the final scale once the gesture settles.
    if (this.raster && gestureState.zooming) return this.raster
    // During a normal draw (allowUpgrade=false) always reuse the existing sprite,
    // even if its bucket is below the current scale: the budgeted warm() pass
    // upgrades it off the critical path, so the stroke stays visible (soft) and
    // never blinks out. Only warm()/first build may (re-)rasterise.
    if (this.raster && !allowUpgrade) return this.raster
    if (this.raster && this.rasterScale >= bucket) return this.raster
    const pad = 2
    const wDoc = b.width() + pad * 2
    const hDoc = b.height() + pad * 2
    let scale = bucket
    let tw = Math.round(wDoc * scale)
    let th = Math.round(hDoc * scale)
    if (Math.max(tw, th) > BRUSH_RASTER_LIMIT) {
      scale *= BRUSH_RASTER_LIMIT / Math.max(tw, th)
      tw = Math.round(wDoc * scale)
      th = Math.round(hDoc * scale)
    }
    const c = document.createElement('canvas')
    c.width = Math.max(1, tw)
    c.height = Math.max(1, th)
    const cc = c.getContext('2d')
    if (!cc) return this.raster
    cc.setTransform(scale, 0, 0, scale, 0, 0)
    cc.translate(-b.min.x + pad, -b.min.y + pad)
    const color = this.strokeColor()
    if (color) {
      cc.globalAlpha = color.a
      cc.fillStyle = color.toCss(1)
      cc.fill(path, 'nonzero')
    }
    this.raster = c
    this.rasterScale = bucket
    return c
  }

  draw(ctx: CanvasRenderingContext2D, zoom = 1) {
    if (!this.ensureOutline()) return
    if (!this.strokeColor()) return
    const m = ctx.getTransform()
    const eff = Math.hypot(m.a, m.b) || zoom
    const raster = this.ensureRaster(Math.max(eff, 1))
    if (!raster) return
    const b = this.bounds()
    const pad = 2
    ctx.drawImage(raster, b.min.x - pad, b.min.y - pad, b.width() + pad * 2, b.height() + pad * 2)
  }

  // Pre-build the vector outline and raster sprite off the interaction critical
  // path (idle warm-up), so the first time a stroke scrolls into view it only
  // pays texture upload, not geometry construction.
  warm(eff: number) {
    if (!this.ensureOutline()) return
    this.ensureRaster(Math.max(eff, 1), true)
  }

  isWarm(eff: number) {
    const bucket = Math.ceil(Math.max(eff, 1) * 2) / 2
    return !!(this.raster && this.rasterScale >= bucket)
  }

  hasRaster() {
    return !!this.raster
  }

  private invalidateOutline() {
    this.cachedPath = null
    this.cachedBounds = null
    this.raster = null
  }

  toSVG(): string {
    if (this.styleKind === BrushStyleKind.Textured) {
      const color = this.textured.stroke_color
      return texturedBrushSVG(
        this.penPath,
        this.textured,
        color ? color.toHex() : '#000000',
        color ? color.a : 1
      )
    }
    const color = this.smooth.stroke_color ? this.smooth.stroke_color.toHex() : 'none'
    return brushStrokeSVG(this.penPath, this.smooth, color, {
      marker: this.styleKind === BrushStyleKind.Marker
    })
  }

  translate(d: Vec2) {
    this.penPath.translate(d)
    // A rigid translation does not change the stroke's appearance. Move the
    // cached bounds alongside and keep the raster sprite — draw() blits it at
    // the new bounds — so a drag never re-rasterises the stroke on every move.
    if (this.cachedBounds) this.cachedBounds = this.cachedBounds.translate(d)
  }
  transform(t: Transform) {
    this.penPath.transform(t)
    this.invalidateOutline()
  }

  hitTest(p: Vec2, ctx: StrokeHitContext): boolean {
    const tol = ctx.tolerance + this.width * 0.5
    const pts = this.penPath.rawPoints()
    for (let i = 1; i < pts.length; i++) {
      if (distSeg(p, pts[i - 1], pts[i]) <= tol) return true
    }
    return pts.length === 1 ? p.distance(pts[0]) <= tol : false
  }

  intersectsAabb(box: Aabb): boolean {
    return this.penPath.intersectsAabb(box)
  }

  intersectsEraser(center: Vec2, radius: number): boolean {
    const box = Aabb.fromHalfExtents(center, new Vec2(radius, radius))
    return this.penPath.intersectsAabb(box)
  }

  // Split the stroke at points inside the eraser disc. Returns leftover
  // strokes; an empty array means the whole stroke is erased.
  splitByEraser(center: Vec2, radius: number): BrushStroke[] {
    const groups: PenPath[] = []
    let current: PenPath | null = null
    for (let i = 0; i < this.penPath.elements.length; i++) {
      const el = this.penPath.elements[i]
      const hit = el.pos.distance(center) <= radius
      if (!hit) {
        if (!current) current = new PenPath([], this.penPath.builderType)
        current.addElement(el.clone())
      } else {
        if (current && current.elements.length > 1) groups.push(current)
        current = null
      }
    }
    if (current && current.elements.length > 1) groups.push(current)
    return groups.map(
      (g) => new BrushStroke(g, this.styleKind, this.smooth.clone(), this.textured.clone())
    )
  }

  invertColors() {
    if (this.smooth.stroke_color) this.smooth.stroke_color = this.smooth.stroke_color.toInvertedBrightnessColor()
    if (this.textured.stroke_color) this.textured.stroke_color = this.textured.stroke_color.toInvertedBrightnessColor()
  }

  duplicate(): Stroke {
    const copy = new BrushStroke(this.penPath.clone(), this.styleKind, this.smooth.clone(), this.textured.clone())
    copy.layer = this.layer
    return copy
  }

  toJSON(): StrokeJSON {
    const pj = this.penPath.toJSON()
    return {
      id: this.id,
      kind: 'brush',
      style_kind: this.styleKind,
      builder_type: pj.builder_type,
      elements: pj.elements,
      start: pj.start,
      segments: pj.segments,
      smooth: this.smooth.toJSON(),
      textured: this.textured.toJSON(),
      layer: this.layer
    }
  }

  static fromJSON(o: any): BrushStroke {
    const path = PenPath.fromJSON(o)
    const smooth = SmoothOptions.fromJSON(o.smooth)
    if (o.style_kind === BrushStyleKind.Marker) {
      smooth.pressure_curve = smooth.pressure_curve || ('const' as any)
    }
    const textured = TexturedOptions.fromJSON(o.textured)
    const stroke = new BrushStroke(path, o.style_kind ?? BrushStyleKind.Solid, smooth, textured, o.id)
    if (o.layer) stroke.layer = o.layer
    return stroke
  }
}

function distSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = b.sub(a)
  const l = ab.lengthSquared()
  if (l < 1e-9) return p.distance(a)
  let t = p.sub(a).dot(ab) / l
  t = Math.max(0, Math.min(1, t))
  return p.distance(a.add(ab.mul(t)))
}
