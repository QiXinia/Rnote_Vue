// Scene renderer: draws workspace, document pages/background, all strokes and
// selection decorations through the camera transform.

import { Vec2, Aabb } from '../../compose/geometry'
import { Engine } from '../engine'
import { Layout } from '../document/layout'
import { PAGE_GAP } from '../document/document'
import { StrokeLayer } from '../../compose/style/options'
import { gestureState } from './gestureState'
import { ContentTiles } from './content-tiles'
import type { Stroke } from '../strokes/stroke'

export const WORKSPACE_COLOR_LIGHT = '#d2d2d5'
export const WORKSPACE_COLOR_DARK = '#24222b'

type SelectMode = false | 'marquee' | 'translate' | 'transform'

export class Renderer {
  ctx: CanvasRenderingContext2D
  canvas: HTMLCanvasElement
  engine: Engine
  dark = false
  // overlay draw callback supplied by the input controller (doc space)
  drawDocOverlay: ((ctx: CanvasRenderingContext2D) => void) | null = null

  // Pan bitmap cache. While the user drags/pads the camera we blit the last
  // fully-rendered frame with a screen-space offset (a single drawImage) instead
  // of re-running viewport culling and hundreds of sprite drawImages every
  // frame; the freshly exposed strips are filled with the workspace colour and a
  // full-quality pass runs when the gesture ends. Mirrors the fact that the
  // desktop rasterises strokes on background threads (render_comp.rs), which the
  // Web main thread cannot do.
  private panCache: HTMLCanvasElement | null = null
  private panning = false
  private panDX = 0
  private panDY = 0
  get isPanning() {
    return this.panning
  }
  private ensurePanCache() {
    if (!this.panCache) this.panCache = document.createElement('canvas')
    if (this.panCache.width !== this.canvas.width || this.panCache.height !== this.canvas.height) {
      this.panCache.width = this.canvas.width
      this.panCache.height = this.canvas.height
    }
  }
  beginPan() {
    this.ensurePanCache()
    // Snapshot the current (static, high-quality) frame in device pixels.
    const pc = this.panCache!.getContext('2d')!
    pc.setTransform(1, 0, 0, 1, 0, 0)
    pc.clearRect(0, 0, this.panCache!.width, this.panCache!.height)
    pc.drawImage(this.canvas, 0, 0)
    this.panDX = 0
    this.panDY = 0
    this.panning = true
  }
  offsetPan(dx: number, dy: number) {
    this.panDX += dx
    this.panDY += dy
  }
  endPan() {
    this.panning = false
  }
  private renderPan() {
    const ctx = this.ctx
    const dpr = this.canvas.width / Math.max(1, this.engine.camera.viewportSize.x)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = this.dark ? WORKSPACE_COLOR_DARK : WORKSPACE_COLOR_LIGHT
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.drawImage(this.panCache!, this.panDX * dpr, this.panDY * dpr)
  }

  // ---- Selection-interaction bitmap caches ----
  // The content does not change while the user drags a marquee or moves a
  // selection, so we never re-run the full scene:
  //   * marquee:   blit a snapshot of the whole frame, then the light overlay
  //   * translate: blit the static (non-selected) layer + the selected layer at
  //                an offset — the selected strokes' geometry is not even
  //                touched until the pointer is released
  //   * transform (rotate/scale): blit the static layer + redraw only the few
  //                selected strokes
  private selectMode: SelectMode = false
  private tiles: ContentTiles | null = null
  private lastStoreVersion = -1
  private fullCache: HTMLCanvasElement | null = null
  private staticCache: HTMLCanvasElement | null = null
  private selectCache: HTMLCanvasElement | null = null
  private selDX = 0
  private selDY = 0
  get isSelecting() {
    return this.selectMode !== false
  }
  private sized(c: HTMLCanvasElement): CanvasRenderingContext2D {
    if (c.width !== this.canvas.width) c.width = this.canvas.width
    if (c.height !== this.canvas.height) c.height = this.canvas.height
    return c.getContext('2d')!
  }
  private snapshotCanvasTo(c: HTMLCanvasElement) {
    const cc = this.sized(c)
    cc.setTransform(1, 0, 0, 1, 0, 0)
    cc.clearRect(0, 0, c.width, c.height)
    cc.drawImage(this.canvas, 0, 0)
  }
  beginMarquee() {
    if (!this.fullCache) this.fullCache = document.createElement('canvas')
    // Build a clean full content frame (no overlay) straight from the data, so
    // it never carries stale selection chrome from the previous canvas frame.
    const cc = this.sized(this.fullCache)
    cc.setTransform(1, 0, 0, 1, 0, 0)
    cc.clearRect(0, 0, this.fullCache.width, this.fullCache.height)
    this.paintScene(cc, { workspace: true })
    this.selectMode = 'marquee'
  }
  beginMove() {
    if (!this.staticCache) this.staticCache = document.createElement('canvas')
    if (!this.selectCache) this.selectCache = document.createElement('canvas')
    this.buildLayerCaches()
    this.selDX = 0
    this.selDY = 0
    this.selectMode = 'translate'
  }
  beginTransform() {
    if (!this.staticCache) this.staticCache = document.createElement('canvas')
    const cc = this.sized(this.staticCache)
    cc.setTransform(1, 0, 0, 1, 0, 0)
    cc.clearRect(0, 0, this.staticCache!.width, this.staticCache!.height)
    this.paintScene(cc, { workspace: true, filter: (s) => !this.engine.store.isSelected(s.id) })
    this.selectMode = 'transform'
  }
  moveSelect(dxDoc: number, dyDoc: number) {
    this.selDX += dxDoc * this.engine.camera.zoom
    this.selDY += dyDoc * this.engine.camera.zoom
  }
  endSelect() {
    this.selectMode = false
    this.selDX = 0
    this.selDY = 0
  }
  // Explicit content-tile invalidation: call only when stroke geometry or
  // appearance actually changes (add/remove/transform/import), never for a mere
  // selection change.
  invalidateTiles() {
    this.tiles!.invalidateAll()
  }
  // Background warm-up entry: build tiles over the viewport plus a read-ahead
  // margin (the normal scroll direction) within a per-frame budget. Returns true
  // when the whole region is ready.
  warmVisibleTiles(budgetMs = 8): boolean {
    const cam = this.engine.camera
    const dpr = this.canvas.width / Math.max(1, cam.viewportSize.x)
    const eff = Math.max(dpr * cam.zoom, 1)
    const vp = cam.visibleDocBounds()
    const region = vp.extend_by(Math.max(vp.width(), vp.height()) * 0.8)
    return this.tiles!.update(region, eff, budgetMs)
  }
  private buildLayerCaches() {
    // Single pass: the workspace/document backdrop is painted once to the
    // static layer, then each visible stroke is drawn exactly once — into the
    // selected layer if it is selected, otherwise the static layer. Running the
    // full scene twice cost ~2x on pointer-down.
    const cam = this.engine.camera
    const dpr = this.canvas.width / Math.max(1, cam.viewportSize.x)
    const sc = this.sized(this.staticCache!)
    const xc = this.sized(this.selectCache!)
    sc.setTransform(1, 0, 0, 1, 0, 0)
    sc.clearRect(0, 0, this.staticCache!.width, this.staticCache!.height)
    xc.setTransform(1, 0, 0, 1, 0, 0)
    xc.clearRect(0, 0, this.selectCache!.width, this.selectCache!.height)

    // static layer backdrop
    sc.setTransform(dpr, 0, 0, dpr, 0, 0)
    sc.fillStyle = this.dark ? WORKSPACE_COLOR_DARK : WORKSPACE_COLOR_LIGHT
    sc.fillRect(0, 0, cam.viewportSize.x, cam.viewportSize.y)
    sc.translate(-cam.offset.x, -cam.offset.y)
    sc.scale(cam.zoom, cam.zoom)
    const viewport0 = cam.visibleDocBounds()
    this.drawDocument(sc, viewport0, this.engine.contentBounds())

    // Static, non-selected content comes from the pre-flattened tiles (sc is in
    // document transform); direct-draw only inside tiles not built yet.
    const missing = this.tiles!.blit(sc, viewport0)
    if (missing.length) {
      this.drawStrokes(sc, (s) => {
        if (this.engine.store.isSelected(s.id)) return false
        const b = s.bounds()
        for (const t of missing) if (t.intersects(b)) return true
        return false
      })
    }

    // selected layer: transparent, same camera transform, only selected strokes
    xc.setTransform(dpr, 0, 0, dpr, 0, 0)
    xc.translate(-cam.offset.x, -cam.offset.y)
    xc.scale(cam.zoom, cam.zoom)
    this.drawStrokes(xc, (s) => this.engine.store.isSelected(s.id))
  }
  private renderMarquee() {
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(this.fullCache!, 0, 0)
    this.drawDocOverlay?.(ctx)
  }
  private renderTranslate() {
    const ctx = this.ctx
    const dpr = this.canvas.width / Math.max(1, this.engine.camera.viewportSize.x)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.drawImage(this.staticCache!, 0, 0)
    ctx.drawImage(this.selectCache!, this.selDX * dpr, this.selDY * dpr)
    // no selection chrome while dragging; it returns on release
  }
  private renderTransformSel() {
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.drawImage(this.staticCache!, 0, 0)
    // only the selected strokes on top (data already updated by the pen)
    this.drawStrokes(ctx, (s) => this.engine.store.isSelected(s.id))
    this.drawDocOverlay?.(ctx)
  }

  constructor(canvas: HTMLCanvasElement, engine: Engine) {
    this.canvas = canvas
    this.engine = engine
    this.ctx = canvas.getContext('2d', { alpha: false })!
    this.tiles = new ContentTiles(engine)
    // Global default: high-quality image scaling. Bitmap/vector image strokes
    // also set this per draw, but the global default covers every drawImage.
    this.ctx.imageSmoothingEnabled = true
    this.ctx.imageSmoothingQuality = 'high'
  }

  // Switch the renderer to another engine (active tab change / open file). The
  // content tiles cache holds a reference to the engine whose strokes it
  // rasterised, so it must be rebound and invalidated too.
  bindEngine(engine: Engine) {
    this.engine = engine
    this.tiles?.bind(engine)
  }

  resize(cssWidth: number, cssHeight: number, dpr: number) {
    this.endPan()
    this.endSelect()
    const w = Math.round(cssWidth * dpr)
    const h = Math.round(cssHeight * dpr)
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.canvas.style.width = `${cssWidth}px`
    this.canvas.style.height = `${cssHeight}px`
    this.engine.camera.setViewport(new Vec2(cssWidth, cssHeight))
  }

  render() {
    if (this.panning) {
      this.renderPan()
      return
    }
    if (this.selectMode === 'marquee') {
      this.renderMarquee()
      return
    }
    if (this.selectMode === 'translate') {
      this.renderTranslate()
      return
    }
    if (this.selectMode === 'transform') {
      this.renderTransformSel()
      return
    }
    this.paintScene(this.ctx, { workspace: true })
    this.drawDocOverlay?.(this.ctx)
  }

  // Paint workspace backdrop, document and (optionally filtered) strokes.
  private paintScene(
    ctx: CanvasRenderingContext2D,
    opts: { workspace: boolean; filter?: (s: Stroke) => boolean }
  ) {
    const cam = this.engine.camera
    const dpr = this.canvas.width / Math.max(1, cam.viewportSize.x)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (opts.workspace) {
      ctx.fillStyle = this.dark ? WORKSPACE_COLOR_DARK : WORKSPACE_COLOR_LIGHT
      ctx.fillRect(0, 0, cam.viewportSize.x, cam.viewportSize.y)
    }

    // document space
    ctx.translate(-cam.offset.x, -cam.offset.y)
    ctx.scale(cam.zoom, cam.zoom)

    const viewport = cam.visibleDocBounds()
    const contentBounds = this.engine.contentBounds()
    if (opts.workspace) this.drawDocument(ctx, viewport, contentBounds)
    if (opts.filter) {
      this.drawStrokes(ctx, opts.filter)
    } else {
      this.drawContentTiled(ctx, viewport, dpr)
    }
  }

  // Pre-flattened tile path for static content: blit ready tiles, directly draw
  // strokes in tiles that are not ready yet, and keep building tiles off the
  // interaction critical path.
  private drawContentTiled(ctx: CanvasRenderingContext2D, viewport: Aabb, dpr: number) {
    const cam = this.engine.camera
    const missing = this.tiles!.blit(ctx, viewport)
    if (missing.length) {
      this.drawStrokes(ctx, (s) => {
        const b = s.bounds()
        for (const t of missing) if (t.intersects(b)) return true
        return false
      })
    }
    // Build/refresh tiles with a small budget while idle (never while zooming or
    // panning, where the cache blits already keep the frame cheap).
    if (!gestureState.zooming && !this.panning) {
      const eff = Math.max(dpr * cam.zoom, 1)
      const ready = this.tiles!.update(viewport, eff, 5)
      if (!ready) this.engine.onRequestRender?.()
    }
  }

  private drawDocument(ctx: CanvasRenderingContext2D, viewport: Aabb, content: Aabb | null) {
    const doc = this.engine.document
    const fmt = doc.format

    if (doc.layout === Layout.Infinite) {
      // Rnote's infinite canvas tiles the background across the viewport. Its
      // format border belongs to the auto-expanded document bounds, which are
      // normally outside the current viewport, not a rectangle around content.
      doc.background.draw(ctx, viewport.extend_by(200))
      return
    }

    const region = doc.renderRegion(viewport, content)
    const drawPage = (b: Aabb, withShadow: boolean) => {
      if (withShadow) this.drawPageShadow(ctx, b)
      doc.background.draw(ctx, b)
      if (fmt.showBorder) {
        ctx.save()
        ctx.strokeStyle = fmt.borderColor.toCss()
        ctx.lineWidth = 1 / this.engine.camera.zoom
        ctx.strokeRect(b.min.x, b.min.y, b.width(), b.height())
        ctx.restore()
      }
    }

    if (doc.layout === Layout.FixedSize) {
      for (const b of region.pages) drawPage(b, true)
    } else {
      // semi / continuous vertical: single column
      if (region.pages.length) drawPage(region.pages[0], false)
    }
  }

  private drawPageShadow(ctx: CanvasRenderingContext2D, b: Aabb) {
    const zoom = this.engine.camera.zoom
    const spread = 12 / zoom
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.28)'
    ctx.shadowBlur = spread
    ctx.shadowOffsetY = 4 / zoom
    ctx.fillStyle = this.engine.document.background.color.toCss()
    ctx.fillRect(b.min.x, b.min.y, b.width(), b.height())
    ctx.restore()
  }

  private drawStrokes(ctx: CanvasRenderingContext2D, filter?: (s: Stroke) => boolean) {
    const cam = this.engine.camera
    const viewport = cam.visibleDocBounds().extend_by(80)
    const tr = ctx.getTransform()
    const eff = Math.max(Math.hypot(tr.a, tr.b), 1)
    // Layer passes mirror rnote-engine chrono_comp::StrokeLayer ordering.
    const layers = [
      StrokeLayer.Document,
      StrokeLayer.Image,
      StrokeLayer.Highlighter,
      StrokeLayer.UserLayer
    ]
    // First-time raster builds are budgeted per frame; strokes that would blow
    // the budget are deferred to the next frame so panning stays responsive
    // (content fills in progressively while the background warm-up catches up).
    const buildStart = performance.now()
    const BUILD_MS = 6
    let deferred = false
    for (const layer of layers) {
      for (const stroke of this.engine.store.ordered()) {
        if (filter && !filter(stroke)) continue
        if ((stroke.layer ?? StrokeLayer.UserLayer) !== layer) continue
        const b = stroke.bounds()
        if (!b.zero() && !viewport.intersects(b)) continue
        // Upgrade the sprite when the resolution bucket changed. If the per-frame
        // budget is exhausted we skip only the upgrade and still draw the existing
        // (slightly soft) sprite below, so strokes never blink out while the
        // background warm-up catches up after a zoom settles.
        let canDraw = true
        if (stroke.isWarm && !gestureState.zooming && !stroke.isWarm(eff)) {
          if (performance.now() - buildStart <= BUILD_MS) {
            stroke.warm?.(eff)
          } else if (stroke.hasRaster && stroke.hasRaster()) {
            // reuse the soft sprite below
          } else {
            canDraw = false
            deferred = true
          }
        }
        if (canDraw) {
          ctx.save()
          stroke.draw(ctx, cam.zoom)
          ctx.restore()
        }
      }
    }
    if (deferred) this.engine.onRequestRender?.()
  }
}

export { PAGE_GAP }
