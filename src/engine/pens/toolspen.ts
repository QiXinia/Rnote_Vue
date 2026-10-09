// Tools pen (rnote pens/tools): vertical space, move view (offset camera),
// zoom and laser pointer.

import { Vec2, Aabb, Transform } from '../../compose/geometry'
import { PenStyle, ToolsStyle } from './pensconfig'
import type { Pen, PenContext, PointerInfo } from './pen'
import { hydrateStroke } from '../strokes/index'

interface LaserSegment {
  points: Vec2[]
  bornAt: number
  lastAt: number
}

export class ToolsPen implements Pen {
  name = PenStyle.Tools
  private active: ToolsStyle = ToolsStyle.VerticalSpace

  // gesture state
  private mode: 'idle' | 'panning' | 'zooming' | 'laser' | 'verticalspace' = 'idle'
  private lastScreen: Vec2 | null = null
  private zoomStart: Vec2 | null = null
  private zoomFocalScreen: Vec2 | null = null
  private startZoom = 1
  private vsLineY = 0
  private vsStartY = 0
  private vsOriginal: Map<number, any> | null = null
  private vsIds: number[] = []
  private vsStartX = 0
  private pointer: Vec2 | null = null

  // laser
  private laser: LaserSegment[] = []
  private laserCurrent: LaserSegment | null = null
  private fadeRaf = 0

  setStyle(style: ToolsStyle) {
    this.active = style
  }
  getStyle(): ToolsStyle {
    return this.active
  }

  onDown(ctx: PenContext, p: PointerInfo) {
    this.pointer = p.docPos.clone()
    this.active = ctx.engine.pensConfig.tools.style
    switch (this.active) {
      case ToolsStyle.OffsetCamera:
        this.mode = 'panning'
        this.lastScreen = p.screenPos.clone()
        break
      case ToolsStyle.Zoom:
        this.mode = 'zooming'
        this.zoomStart = p.screenPos.clone()
        this.zoomFocalScreen = p.screenPos.clone()
        this.startZoom = ctx.engine.camera.zoom
        break
      case ToolsStyle.Laser:
        this.mode = 'laser'
        this.laserCurrent = { points: [p.docPos.clone()], bornAt: performance.now(), lastAt: performance.now() }
        break
      case ToolsStyle.VerticalSpace:
      default:
        this.mode = 'verticalspace'
        this.vsLineY = p.docPos.y
        this.vsStartY = p.docPos.y
        this.vsStartX = p.docPos.x
        this.vsOriginal = this.snapshotAll(ctx)
        this.vsIds = this.computeVsIds(ctx, p.docPos)
        break
    }
  }

  onMove(ctx: PenContext, p: PointerInfo) {
    this.pointer = p.docPos.clone()
    switch (this.mode) {
      case 'panning': {
        const delta = p.screenPos.sub(this.lastScreen!)
        ctx.panByScreen(delta)
        this.lastScreen = p.screenPos.clone()
        break
      }
      case 'zooming': {
        // Drag up zooms in, drag down zooms out: new = old*(1 - dy*0.005),
        // where dy is the downward screen offset (Camera DRAG_ZOOM factor).
        const offsetY = p.screenPos.y - this.zoomStart!.y
        const newZoom = this.startZoom * (1 - offsetY * 0.005)
        ctx.engine.camera.setZoom(newZoom, this.zoomFocalScreen!)
        break
      }
      case 'laser':
        this.laserCurrent?.points.push(p.docPos.clone())
        if (this.laserCurrent) this.laserCurrent.lastAt = performance.now()
        break
      case 'verticalspace': {
        const deltaY = p.docPos.y - this.vsStartY
        this.vsLineY = p.docPos.y
        this.applyVerticalSpace(ctx, deltaY)
        break
      }
    }
    ctx.render()
  }

  onUp(ctx: PenContext) {
    if (this.mode === 'verticalspace' && this.vsOriginal) {
      const after = this.snapshotAll(ctx)
      const before = this.vsOriginal
      ctx.engine.history.push({
        label: 'Insert Vertical Space',
        undo: () => this.applySnapshot(ctx, before),
        redo: () => this.applySnapshot(ctx, after)
      })
      ctx.engine.notify()
    }
    if (this.mode === 'laser' && this.laserCurrent && this.laserCurrent.points.length > 1) {
      this.laser.push(this.laserCurrent)
      this.scheduleFade(ctx)
    }
    this.mode = 'idle'
    this.laserCurrent = null
    this.vsOriginal = null
    ctx.render()
  }

  // Port of store::keys_between for the vertical-space gesture: selects the
  // strokes intersecting the region below the insertion line, optionally
  // constrained to the current page column (vertical borders) and the next
  // horizontal page boundary (horizontal borders).
  private computeVsIds(ctx: PenContext, pos: Vec2): number[] {
    const tc = ctx.engine.pensConfig.tools
    const fmt = ctx.engine.document.format
    const yMax = (Math.floor(pos.y / fmt.height) + 1) * fmt.height
    const col = Math.floor(pos.x / fmt.width)
    const xMin = tc.limitVerticalPageBorders ? col * fmt.width : -Infinity
    const xMax = tc.limitVerticalPageBorders ? (col + 1) * fmt.width : Infinity
    const yBottom = tc.limitHorizontalPageBorders ? yMax : Infinity
    const region = Aabb.new(new Vec2(xMin, pos.y), new Vec2(xMax, yBottom))
    const ids: number[] = []
    for (const s of ctx.engine.store.all()) {
      if (s.bounds().intersects(region)) ids.push(s.id)
    }
    return ids
  }

  private applyVerticalSpace(ctx: PenContext, deltaY: number) {
    if (!this.vsOriginal) return
    const idset = new Set(this.vsIds)
    for (const [id, json] of this.vsOriginal) {
      if (!idset.has(id)) continue
      const fresh = hydrateStroke(json)
      if (!fresh) continue
      fresh.translate(new Vec2(0, deltaY))
      ctx.engine.store.strokes.set(id, fresh)
    }
    ctx.engine.store.bump()
  }

  private snapshotAll(ctx: PenContext): Map<number, any> {
    const m = new Map<number, any>()
    for (const s of ctx.engine.store.all()) m.set(s.id, s.toJSON())
    return m
  }
  private applySnapshot(ctx: PenContext, snap: Map<number, any>) {
    for (const [id, json] of snap) {
      const fresh = hydrateStroke(json)
      if (fresh) ctx.engine.store.strokes.set(id, fresh)
    }
    ctx.engine.store.bump()
    ctx.render()
  }

  private scheduleFade(ctx: PenContext) {
    cancelAnimationFrame(this.fadeRaf)
    const tick = () => {
      const now = performance.now()
      let changed = false
      for (const seg of this.laser) {
        if (now - seg.lastAt < 1000) changed = true
      }
      this.laser = this.laser.filter((s) => now - s.lastAt < 1000)
      ctx.render()
      if (changed || this.laserCurrent) this.fadeRaf = requestAnimationFrame(tick)
    }
    this.fadeRaf = requestAnimationFrame(tick)
  }

  drawOverlay(docCtx: CanvasRenderingContext2D, ctx: PenContext) {
    const zoom = ctx.engine.camera.zoom
    docCtx.save()
    if (this.mode === 'verticalspace' || (this.active === ToolsStyle.VerticalSpace && this.pointer && this.mode === 'idle')) {
      const y = this.mode === 'verticalspace' ? this.vsLineY : this.pointer!.y
      const view = ctx.engine.camera.visibleDocBounds()
      docCtx.strokeStyle = '#1c71d8'
      docCtx.lineWidth = 2 / zoom
      docCtx.setLineDash([8 / zoom, 6 / zoom])
      docCtx.beginPath()
      docCtx.moveTo(view.min.x, y)
      docCtx.lineTo(view.max.x, y)
      docCtx.stroke()
      docCtx.setLineDash([])
      // arrows
      docCtx.fillStyle = '#1c71d8'
      this.drawArrow(docCtx, new Vec2(view.center().x, y), zoom)
    }

    if (this.mode === 'zooming') {
      const z = Math.round(ctx.engine.camera.zoom * 100)
      const doc = ctx.engine.camera.screenToDoc(this.zoomFocalScreen ?? new Vec2(0, 0))
      docCtx.save()
      docCtx.fillStyle = 'rgba(0,0,0,0.7)'
      const label = `${z}%`
      docCtx.font = 'bold 28px sans-serif'
      const w = docCtx.measureText(label).width
      docCtx.fillRect(doc.x - w / 2 - 16, doc.y - 46, w + 32, 44)
      docCtx.fillStyle = '#fff'
      docCtx.textAlign = 'center'
      docCtx.fillText(label, doc.x, doc.y - 14)
      docCtx.restore()
    }

    // laser trail
    const now = performance.now()
    const drawSeg = (seg: LaserSegment, alpha: number) => {
      if (seg.points.length < 2) return
      docCtx.save()
      docCtx.lineCap = 'round'
      docCtx.lineJoin = 'round'
      const trace = () => {
        docCtx.beginPath()
        seg.points.forEach((p, i) => (i === 0 ? docCtx.moveTo(p.x, p.y) : docCtx.lineTo(p.x, p.y)))
        docCtx.stroke()
      }
      // Outer red stroke (GNOME_REDS[1], width 6) then inner bright stroke
      // (GNOME_BRIGHTS[1], width 1), matching LaserTool's two-pass render.
      docCtx.strokeStyle = `rgba(237,51,59,${alpha})`
      docCtx.lineWidth = 6 / zoom
      trace()
      docCtx.strokeStyle = `rgba(246,245,244,${alpha})`
      docCtx.lineWidth = 1 / zoom
      trace()
      docCtx.restore()
    }
    for (const seg of this.laser) {
      const age = (now - seg.lastAt) / 1000
      drawSeg(seg, Math.max(0, 1 - age))
    }
    if (this.laserCurrent) drawSeg(this.laserCurrent, 1)
    docCtx.restore()
  }

  private drawArrow(ctx: CanvasRenderingContext2D, at: Vec2, zoom: number) {
    const s = 10 / zoom
    ctx.save()
    ctx.translate(at.x, at.y)
    ctx.beginPath()
    ctx.moveTo(0, -s)
    ctx.lineTo(-s * 0.7, -s * 0.1)
    ctx.lineTo(s * 0.7, -s * 0.1)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(0, s)
    ctx.lineTo(-s * 0.7, s * 0.1)
    ctx.lineTo(s * 0.7, s * 0.1)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  cursor(ctx: PenContext): string {
    switch (ctx.engine.pensConfig.tools.style) {
      case ToolsStyle.OffsetCamera:
        return 'grab'
      case ToolsStyle.Zoom:
        return 'zoom-in'
      case ToolsStyle.Laser:
        return 'crosshair'
      default:
        return 'row-resize'
    }
  }

  cancel(ctx: PenContext) {
    this.mode = 'idle'
    ctx.render()
  }
}
