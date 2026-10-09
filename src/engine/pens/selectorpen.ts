// Selector pen (rnote pens/selector): rectangle / polygon-lasso / single /
// intersecting-path selection, plus move, rotate and 8-handle resize.

import { Vec2, Aabb, Transform } from '../../compose/geometry'
import { PenStyle, SelectorStyle } from './pensconfig'
import type { Pen, PenContext, PointerInfo } from './pen'
import { hydrateStroke, TextStroke, type Stroke } from '../strokes/index'

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate' | null
type Gesture =
  | { kind: 'none' }
  | { kind: 'marquee'; start: Vec2; current: Vec2 }
  | { kind: 'lasso'; points: Vec2[]; current: Vec2 }
  | { kind: 'path'; points: Vec2[] }
  | { kind: 'translate'; downStart: Vec2; start: Vec2; original: Map<number, any> }
  | { kind: 'rotate'; center: Vec2; startAngle: number; accumulated: number; original: Map<number, any> }
  | { kind: 'scale'; handle: Exclude<HandleId, 'rotate' | null>; original: Map<number, any>; b0: Aabb; aspect: number }

const HANDLE_PX = 8
const ROTATE_OFFSET_PX = 36

export class SelectorPen implements Pen {
  name = PenStyle.Selector
  private gesture: Gesture = { kind: 'none' }
  private hoverHandle: HandleId = null
  private pointer: Vec2 | null = null
  private downHitSelected = false

  // Tolerance for the free-path (lasso/path) selection, mirroring the desktop
  // SELECTING_SINGLE_CIRCLE_RADIUS (4.0 px). Single-click picking uses no extra
  // radius (the stroke's own half-width only) to match desktop hitboxes.
  private tolerance(ctx: PenContext): number {
    return 4 / ctx.engine.camera.zoom
  }

  private handleLayout(ctx: PenContext): { rect: Aabb; handles: Map<Exclude<HandleId, null>, Vec2>; rotate: Vec2 } | null {
    const b = ctx.engine.store.boundsSelected()
    if (!b || b.zero()) return null
    const handles = new Map<Exclude<HandleId, null>, Vec2>()
    const tl = b.min
    const br = b.max
    const tr = new Vec2(br.x, tl.y)
    const bl = new Vec2(tl.x, br.y)
    const c = b.center()
    handles.set('nw', tl)
    handles.set('n', new Vec2(c.x, tl.y))
    handles.set('ne', tr)
    handles.set('e', new Vec2(br.x, c.y))
    handles.set('se', br)
    handles.set('s', new Vec2(c.x, br.y))
    handles.set('sw', bl)
    handles.set('w', new Vec2(tl.x, c.y))
    const rotate = new Vec2(c.x, tl.y - ROTATE_OFFSET_PX / ctx.engine.camera.zoom)
    return { rect: b, handles, rotate }
  }

  private hitHandle(ctx: PenContext, p: Vec2): HandleId {
    const layout = this.handleLayout(ctx)
    if (!layout) return null
    const tol = HANDLE_PX * 1.6 / ctx.engine.camera.zoom
    if (p.distance(layout.rotate) <= tol + 6 / ctx.engine.camera.zoom) return 'rotate'
    for (const [id, pos] of layout.handles) {
      if (p.distance(pos) <= tol) return id as HandleId
    }
    return null
  }

  onDown(ctx: PenContext, p: PointerInfo) {
    const engine = ctx.engine
    const cfg = engine.pensConfig.selector
    this.pointer = p.docPos.clone()

    // 1) handles take priority
    const handle = this.hitHandle(ctx, p.docPos)
    if (handle && engine.store.selected.size) {
      if (handle === 'rotate') {
        const b = engine.store.boundsSelected()!
        const center = b.center()
        this.gesture = {
          kind: 'rotate',
          center,
          startAngle: Math.atan2(p.docPos.y - center.y, p.docPos.x - center.x),
          accumulated: 0,
          original: this.snapshotSelected(ctx)
        }
      } else {
        const b0 = engine.store.boundsSelected()!
        const original = new Map<number, any>()
        for (const id of engine.store.selected) {
          const s = engine.store.get(id)
          if (s) original.set(id, s.toJSON())
        }
        this.gesture = {
          kind: 'scale',
          handle,
          original,
          b0,
          aspect: b0.width() / Math.max(b0.height(), 1e-6)
        }
      }
      ctx.beginTransformSel()
      ctx.render()
      return
    }

    // 2) clicking on a stroke
    const hits = engine.store.hitTestPoint(p.docPos, 0, engine.camera.zoom, true)
    if (hits.length) {
      const id = hits[0]
      if (p.shift) {
        engine.store.toggleSelected(id)
      } else if (!engine.store.isSelected(id)) {
        engine.store.select(id)
      }
      this.downHitSelected = engine.store.isSelected(id)
      if (this.downHitSelected) {
        this.gesture = {
          kind: 'translate',
          downStart: p.docPos.clone(),
          start: p.docPos.clone(),
          original: this.snapshotSelected(ctx)
        }
        ctx.beginMoveSel()
      }
      ctx.render()
      return
    }

    // 3) empty space: begin a selection gesture or clear
    if (cfg.style === SelectorStyle.Single) {
      if (!p.shift) engine.store.deselectAll()
      this.gesture = { kind: 'none' }
      ctx.render()
      return
    }
    if (!p.shift) engine.store.deselectAll()
    if (cfg.style === SelectorStyle.Rectangle) {
      this.gesture = { kind: 'marquee', start: p.docPos.clone(), current: p.docPos.clone() }
    } else if (cfg.style === SelectorStyle.Polygon) {
      this.gesture = { kind: 'lasso', points: [p.docPos.clone()], current: p.docPos.clone() }
    } else {
      this.gesture = { kind: 'path', points: [p.docPos.clone()] }
    }
    if (this.gesture.kind === 'marquee') ctx.beginMarquee()
    ctx.render()
  }

  onMove(ctx: PenContext, p: PointerInfo) {
    this.pointer = p.docPos.clone()
    const engine = ctx.engine
    const g = this.gesture
    switch (g.kind) {
      case 'marquee':
        g.current = p.docPos.clone()
        this.previewMarquee(ctx, Aabb.new(g.start, g.current), false)
        break
      case 'lasso':
        g.current = p.docPos.clone()
        break
      case 'path':
        g.points.push(p.docPos.clone())
        engine.store.setSelection(engine.store.hitTestPath(g.points, this.tolerance(ctx), engine.camera.zoom))
        break
      case 'translate': {
        const delta = p.docPos.sub(g.start)
        // Defer all data changes; just shift the selected-layer bitmap.
        ctx.moveSelect(delta.x, delta.y)
        g.start = p.docPos.clone()
        break
      }
      case 'rotate': {
        const angleNow = Math.atan2(p.docPos.y - g.center.y, p.docPos.x - g.center.x)
        let total = angleNow - g.startAngle
        // normalise around the accumulated angle to avoid wrapping
        while (total - g.accumulated > Math.PI) total -= Math.PI * 2
        while (total - g.accumulated < -Math.PI) total += Math.PI * 2
        if (p.shift) {
          const step = Math.PI / 12
          total = Math.round(total / step) * step
        }
        this.restoreAndTransform(ctx, g.original, Transform.rotation(total, g.center))
        g.accumulated = total
        break
      }
      case 'scale':
        this.doScale(ctx, p.docPos, p.shift || engine.pensConfig.selector.resizeLockAspectRatio, g)
        break
    }
    if (g.kind !== 'none') ctx.render()
    else {
      const h = this.hitHandle(ctx, p.docPos)
      if (h !== this.hoverHandle) {
        this.hoverHandle = h
        ctx.render()
      }
    }
  }

  private snapshotSelected(ctx: PenContext): Map<number, any> {
    const m = new Map<number, any>()
    for (const id of ctx.engine.store.selected) {
      const s = ctx.engine.store.get(id)
      if (s) m.set(id, s.toJSON())
    }
    return m
  }

  private restoreAndTransform(ctx: PenContext, original: Map<number, any>, t: Transform) {
    for (const [id, json] of original) {
      const fresh = hydrateStroke(json)
      if (fresh) {
        fresh.transform(t)
        ctx.engine.store.strokes.set(id, fresh)
      }
    }
    ctx.engine.store.bump()
  }

  private doScale(ctx: PenContext, pos: Vec2, lockAspect: boolean, g: Extract<Gesture, { kind: 'scale' }>) {
    const b0 = g.b0
    const c0 = b0.center()
    let x0 = b0.min.x
    let y0 = b0.min.y
    let x1 = b0.max.x
    let y1 = b0.max.y
    const H = g.handle
    if (H.includes('w')) x0 = pos.x
    if (H.includes('e')) x1 = pos.x
    if (H.startsWith('n') || H === 'nw' || H === 'sw') y0 = pos.y
    if (H === 's' || H === 'se' || H === 'sw') y1 = pos.y
    if (x1 <= x0) x1 = x0 + 1
    if (y1 <= y0) y1 = y0 + 1
    let w = x1 - x0
    let h = y1 - y0
    if (lockAspect) {
      const target = Math.max(w, h)
      w = target
      h = target / g.aspect
      // keep the anchored corner fixed
      if (H.includes('w')) x0 = x1 - w
      if (H.includes('e')) x1 = x0 + w
      if (H.startsWith('n') || H === 'nw' || H === 'sw') y0 = y1 - h
      if (H === 's' || H === 'se' || H === 'sw') y1 = y0 + h
    }
    const sx = w / b0.width()
    const sy = h / b0.height()
    const c1 = new Aabb(new Vec2(x0, y0), new Vec2(x1, y1)).center()
    const t = Transform.translationVec(c1.sub(c0)).append(Transform.scale(sx, sy, c0))
    this.restoreAndTransform(ctx, g.original, t)
  }

  onUp(ctx: PenContext, p: PointerInfo) {
    const engine = ctx.engine
    const g = this.gesture
    if (g.kind === 'marquee') {
      this.previewMarquee(ctx, Aabb.new(g.start, g.current), true)
      ctx.endSelect()
    } else if (g.kind === 'lasso') {
      if (g.points.length >= 3) {
        engine.store.setSelection(engine.store.hitTestPolygon(g.points))
      }
    } else if (g.kind === 'translate') {
      // Data was untouched during the drag; commit the total displacement once.
      const total = p.docPos.sub(g.downStart)
      if (total.x !== 0 || total.y !== 0) {
        engine.store.translateStrokes(engine.store.selected, total)
      }
      engine.history.breakCoalesce()
      const after = this.snapshotSelected(ctx)
      engine.history.push({
        label: 'Move Selection',
        undo: () => this.applySnapshot(ctx, g.original),
        redo: () => this.applySnapshot(ctx, after)
      })
      engine.notify()
      ctx.invalidateTiles()
      ctx.endSelect()
    } else if (g.kind === 'rotate' || g.kind === 'scale') {
      engine.history.breakCoalesce()
      const after = this.snapshotSelected(ctx)
      engine.history.push({
        label: g.kind === 'rotate' ? 'Rotate Selection' : 'Resize Selection',
        undo: () => this.applySnapshot(ctx, g.original),
        redo: () => this.applySnapshot(ctx, after)
      })
      engine.notify()
      ctx.invalidateTiles()
      ctx.endSelect()
    }
    this.gesture = { kind: 'none' }
    ctx.render()
  }

  private applySnapshot(ctx: PenContext, snap: Map<number, any>) {
    for (const [id, json] of snap) {
      const fresh = hydrateStroke(json)
      if (fresh) ctx.engine.store.strokes.set(id, fresh)
    }
    ctx.engine.store.bump()
    ctx.invalidateTiles()
    ctx.render()
  }

  onDouble(ctx: PenContext, p: PointerInfo) {
    const hits = ctx.engine.store.hitTestPoint(p.docPos, 0, ctx.engine.camera.zoom, true)
    if (!hits.length) return
    const stroke = ctx.engine.store.get(hits[0])
    if (stroke instanceof TextStroke) {
      ctx.engine.store.select(stroke.id)
      ctx.beginTextEdit(stroke.translation, stroke.id)
    }
  }

  onKeyDown(ctx: PenContext, e: KeyboardEvent) {
    const g = this.gesture
    if (g.kind === 'lasso') {
      if (e.key === 'Enter' || e.key === ' ') {
        this.gesture = { kind: 'none' }
        if (g.points.length >= 3) ctx.engine.store.setSelection(ctx.engine.store.hitTestPolygon(g.points))
        ctx.render()
        e.preventDefault()
      } else if (e.key === 'Escape') {
        this.gesture = { kind: 'none' }
        ctx.render()
      }
    } else {
      const step = e.shiftKey ? 20 : 2
      let delta: Vec2 | null = null
      if (e.key === 'ArrowLeft') delta = new Vec2(-step, 0)
      if (e.key === 'ArrowRight') delta = new Vec2(step, 0)
      if (e.key === 'ArrowUp') delta = new Vec2(0, -step)
      if (e.key === 'ArrowDown') delta = new Vec2(0, step)
      if (delta) {
        const ids = [...ctx.engine.store.selected]
        const before = this.snapshotSelected(ctx)
        ctx.engine.store.translateStrokes(ids, delta)
        const after = this.snapshotSelected(ctx)
        ctx.engine.history.push({
          label: 'Nudge Selection',
          coalesceKey: `nudge-${e.key}-${e.shiftKey}`,
          undo: () => this.applySnapshot(ctx, before),
          redo: () => this.applySnapshot(ctx, after)
        })
        ctx.render()
        e.preventDefault()
      }
    }
  }

  private previewMarquee(ctx: PenContext, box: Aabb, commit: boolean) {
    const ids = ctx.engine.store.hitTestAabb(box)
    ctx.engine.store.setSelection(ids)
  }

  drawOverlay(docCtx: CanvasRenderingContext2D, ctx: PenContext) {
    const zoom = ctx.engine.camera.zoom
    // in-progress selection regions
    const g = this.gesture
    docCtx.save()
    if (g.kind === 'marquee') {
      const b = Aabb.new(g.start, g.current)
      docCtx.fillStyle = 'rgba(28,113,216,0.12)'
      docCtx.fillRect(b.min.x, b.min.y, b.width(), b.height())
      docCtx.strokeStyle = '#1c71d8'
      docCtx.lineWidth = 1 / zoom
      docCtx.setLineDash([6 / zoom, 4 / zoom])
      docCtx.strokeRect(b.min.x, b.min.y, b.width(), b.height())
      docCtx.setLineDash([])
    } else if (g.kind === 'lasso' || g.kind === 'path') {
      const pts = g.kind === 'lasso' ? [...g.points, g.current] : g.points
      if (pts.length > 1) {
        docCtx.strokeStyle = '#1c71d8'
        docCtx.lineWidth = 1 / zoom
        docCtx.setLineDash([6 / zoom, 4 / zoom])
        docCtx.beginPath()
        pts.forEach((p, i) => (i === 0 ? docCtx.moveTo(p.x, p.y) : docCtx.lineTo(p.x, p.y)))
        if (g.kind === 'lasso') docCtx.closePath()
        docCtx.stroke()
        docCtx.setLineDash([])
      }
    }
    docCtx.restore()

    // selection chrome (hidden while a marquee/translate gesture is in flight)
    const showChrome = g.kind === 'none' || g.kind === 'rotate' || g.kind === 'scale'
    if (showChrome && ctx.engine.store.selected.size) {
      const layout = this.handleLayout(ctx)
      if (!layout) return
      const b = layout.rect
      docCtx.save()
      docCtx.strokeStyle = '#1c71d8'
      docCtx.lineWidth = 1 / zoom
      docCtx.setLineDash([6 / zoom, 4 / zoom])
      docCtx.strokeRect(b.min.x, b.min.y, b.width(), b.height())
      docCtx.setLineDash([])

      // rotation handle + connector
      docCtx.strokeStyle = '#1c71d8'
      docCtx.beginPath()
      docCtx.moveTo(b.center().x, b.min.y)
      docCtx.lineTo(layout.rotate.x, layout.rotate.y)
      docCtx.stroke()
      this.drawHandle(docCtx, layout.rotate, zoom, true)
      for (const [, pos] of layout.handles) this.drawHandle(docCtx, pos, zoom, false)
      docCtx.restore()
    }
  }

  private drawHandle(docCtx: CanvasRenderingContext2D, pos: Vec2, zoom: number, rotate: boolean) {
    const size = HANDLE_PX / zoom
    docCtx.save()
    docCtx.fillStyle = rotate ? '#1c71d8' : '#ffffff'
    docCtx.strokeStyle = '#1c71d8'
    docCtx.lineWidth = 1.5 / zoom
    if (rotate) {
      docCtx.beginPath()
      docCtx.arc(pos.x, pos.y, size * 0.9, 0, Math.PI * 2)
      docCtx.fill()
    } else {
      docCtx.fillRect(pos.x - size / 2, pos.y - size / 2, size, size)
      docCtx.strokeRect(pos.x - size / 2, pos.y - size / 2, size, size)
    }
    docCtx.restore()
  }

  cursor(ctx: PenContext, p: PointerInfo): string {
    if (this.gesture.kind !== 'none') return 'grabbing'
    const h = this.hitHandle(ctx, p.docPos) as string | null
    if (h === 'rotate') return 'crosshair'
    if (h && h !== 'rotate') return handleCursor(h)
    const hits = ctx.engine.store.hitTestPoint(p.docPos, 0, ctx.engine.camera.zoom, true)
    if (hits.length && ctx.engine.store.isSelected(hits[0])) return 'move'
    return 'default'
  }

  cancel(ctx: PenContext) {
    this.gesture = { kind: 'none' }
    ctx.render()
  }
}

function handleCursor(h: string): string {
  const map: Record<string, string> = {
    nw: 'nwse-resize',
    se: 'nwse-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize'
  }
  return map[h] ?? 'pointer'
}
