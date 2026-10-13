// Selector pen (rnote pens/selector): rectangle / polygon-lasso / single /
// intersecting-path selection, plus move, rotate and 4-corner resize.
//
// Geometry mirrors rnote-engine/src/pens/selector/{mod,penevents}.rs:
//   - selection bounds get a 5% light-grey fill and a 94% grey solid outline
//   - four 18px resize squares sit OUTSIDE the corners (at corner +/- 9px)
//   - one 18px rotate circle sits OUTSIDE the right-edge midpoint
//   - Ctrl (or the lock toggle) locks aspect ratio; Shift adds to the selection

import { Vec2, Aabb, Transform } from '../../compose/geometry'
import { PenStyle, SelectorStyle } from './pensconfig'
import type { Pen, PenContext, PointerInfo } from './pen'
import { hydrateStroke, TextStroke, type Stroke } from '../strokes/index'

type HandleId = 'tl' | 'tr' | 'bl' | 'br' | 'rotate' | null
type Gesture =
  | { kind: 'none' }
  | { kind: 'marquee'; start: Vec2; current: Vec2 }
  | { kind: 'lasso'; points: Vec2[]; current: Vec2 }
  | { kind: 'path'; points: Vec2[] }
  | { kind: 'translate'; downStart: Vec2; start: Vec2; original: Map<number, any> }
  | { kind: 'rotate'; center: Vec2; startAngle: number; original: Map<number, any> }
  | { kind: 'scale'; corner: Exclude<HandleId, 'rotate' | null>; startPos: Vec2; startBounds: Aabb; original: Map<number, any> }

// Surface-space node metrics (rnote selector/mod.rs).
const NODE_SIZE_PX = 18
const NODE_HALF_PX = NODE_SIZE_PX * 0.5
const OUTLINE_WIDTH_PX = 2
const SINGLE_CIRCLE_RADIUS_PX = 4
const DASH_PATTERN: [number, number] = [12, 6]
const MIN_EXTENT_PX = 2

// Selection chrome colors (GNOME_BRIGHTS + GNOME_BLUES).
const SEL_FILL = 'rgba(222,221,218,0.051)' // GNOME_BRIGHTS[2], a8 13
const SEL_OUTLINE = 'rgba(154,153,150,0.941)' // GNOME_BRIGHTS[4], a8 240
const NODE_OUTLINE = '#1a5fb4' // GNOME_BLUES[4]
const NODE_FILL_PROXIMITY = 'rgba(153,193,241,0.302)' // GNOME_BLUES[0], a8 77
const NODE_FILL_DOWN = 'rgba(53,132,228,0.502)' // GNOME_BLUES[2], a8 128
const NODE_BG = '#ffffff'

export class SelectorPen implements Pen {
  name = PenStyle.Selector
  private gesture: Gesture = { kind: 'none' }
  private hoverHandle: HandleId = null
  private pointer: Vec2 | null = null
  private downHandle: HandleId = null
  private downHitSelected = false

  // Tolerance for the free-path (lasso/path) selection, mirroring the desktop
  // SELECTING_SINGLE_CIRCLE_RADIUS (4.0 px).
  private tolerance(ctx: PenContext): number {
    return SINGLE_CIRCLE_RADIUS_PX / ctx.engine.camera.zoom
  }

  private handleLayout(ctx: PenContext): { rect: Aabb; corners: Map<Exclude<HandleId, 'rotate' | null>, Vec2>; rotate: Vec2 } | null {
    const b = ctx.engine.store.boundsSelected()
    if (!b || b.zero()) return null
    const off = NODE_HALF_PX / ctx.engine.camera.zoom
    const corners = new Map<Exclude<HandleId, 'rotate' | null>, Vec2>()
    corners.set('tl', new Vec2(b.min.x - off, b.min.y - off))
    corners.set('tr', new Vec2(b.max.x + off, b.min.y - off))
    corners.set('bl', new Vec2(b.min.x - off, b.max.y + off))
    corners.set('br', new Vec2(b.max.x + off, b.max.y + off))
    const rotate = new Vec2(b.max.x + off, b.center().y)
    return { rect: b, corners, rotate }
  }

  private hitHandle(ctx: PenContext, p: Vec2): HandleId {
    const layout = this.handleLayout(ctx)
    if (!layout) return null
    const r = (NODE_HALF_PX + 3) / ctx.engine.camera.zoom
    if (p.distance(layout.rotate) <= r) return 'rotate'
    for (const [id, pos] of layout.corners) {
      if (p.distance(pos) <= r) return id as HandleId
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
      this.downHandle = handle
      if (handle === 'rotate') {
        const b = engine.store.boundsSelected()!
        this.gesture = {
          kind: 'rotate',
          center: b.center(),
          startAngle: Math.atan2(p.docPos.y - b.center().y, p.docPos.x - b.center().x),
          original: this.snapshotSelected(ctx)
        }
      } else {
        this.gesture = {
          kind: 'scale',
          corner: handle,
          startPos: p.docPos.clone(),
          startBounds: engine.store.boundsSelected()!,
          original: this.snapshotSelected(ctx)
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
    if (!p.shift) engine.store.deselectAll()
    if (cfg.style === SelectorStyle.Single) {
      this.gesture = { kind: 'none' }
      ctx.render()
      return
    }
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
        // Desktop applies incremental angle deltas above a 0.2 deg threshold;
        // there is no modifier snapping. Recompute from the original snapshot.
        const angle = Math.atan2(p.docPos.y - g.center.y, p.docPos.x - g.center.x)
        let total = angle - g.startAngle
        while (total > Math.PI) total -= Math.PI * 2
        while (total < -Math.PI) total += Math.PI * 2
        this.restoreAndTransform(ctx, g.original, Transform.rotation(total, g.center))
        break
      }
      case 'scale':
        this.doScale(ctx, p, g)
        break
    }
    if (g.kind !== 'none') {
      ctx.render()
    } else {
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

  // 1:1 port of penevents.rs Resize handling.
  private doScale(ctx: PenContext, p: PointerInfo, g: Extract<Gesture, { kind: 'scale' }>) {
    const zoom = ctx.engine.camera.zoom
    const lock = p.ctrl || ctx.engine.pensConfig.selector.resizeLockAspectRatio

    // Pointer displacement from the press point, then sign-flip per corner so a
    // drag outward always grows the bounds.
    const raw = p.docPos.sub(g.startPos)
    const flipX = g.corner === 'tl' || g.corner === 'bl' ? -1 : 1
    const flipY = g.corner === 'tl' || g.corner === 'tr' ? -1 : 1
    let adj = new Vec2(raw.x * flipX, raw.y * flipY)

    const ext0 = new Vec2(g.startBounds.width(), g.startBounds.height())
    if (lock) {
      const startMean = (ext0.x + ext0.y) * 0.5
      const adjMean = (adj.x + adj.y) * 0.5
      const k = adjMean / startMean
      adj = new Vec2(ext0.x * k, ext0.y * k)
    }

    const minExt = MIN_EXTENT_PX / zoom
    const newExt = new Vec2(Math.max(ext0.x + adj.x, minExt), Math.max(ext0.y + adj.y, minExt))
    const scale = new Vec2(newExt.x / ext0.x, newExt.y / ext0.y)

    // Pivot is the opposite (anchored) corner.
    let pivot: Vec2
    if (g.corner === 'tl') pivot = g.startBounds.max
    else if (g.corner === 'tr') pivot = new Vec2(g.startBounds.min.x, g.startBounds.max.y)
    else if (g.corner === 'bl') pivot = new Vec2(g.startBounds.max.x, g.startBounds.min.y)
    else pivot = g.startBounds.min

    this.restoreAndTransform(ctx, g.original, Transform.scale(scale.x, scale.y, pivot))
  }

  onUp(ctx: PenContext, p: PointerInfo) {
    const engine = ctx.engine
    const g = this.gesture
    if (g.kind === 'marquee') {
      // Desktop commits the selection only on release.
      const ids = engine.store.hitTestAabb(Aabb.new(g.start, g.current))
      engine.store.setSelection(ids)
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
    this.downHandle = null
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

  drawOverlay(docCtx: CanvasRenderingContext2D, ctx: PenContext) {
    const zoom = ctx.engine.camera.zoom
    const cfg = ctx.engine.pensConfig.selector
    const g = this.gesture
    docCtx.save()

    // in-progress selection regions (dashed, grey)
    if (g.kind === 'marquee') {
      this.drawSelectBox(docCtx, Aabb.new(g.start, g.current), false, zoom)
    } else if (g.kind === 'lasso' || g.kind === 'path') {
      const pts = g.kind === 'lasso' ? [...g.points, g.current] : g.points
      if (pts.length > 1) {
        docCtx.fillStyle = SEL_FILL
        docCtx.strokeStyle = SEL_OUTLINE
        docCtx.lineWidth = OUTLINE_WIDTH_PX / zoom
        docCtx.setLineDash(DASH_PATTERN.map((x) => x / zoom) as [number, number])
        docCtx.beginPath()
        pts.forEach((p, i) => (i === 0 ? docCtx.moveTo(p.x, p.y) : docCtx.lineTo(p.x, p.y)))
        if (g.kind === 'lasso') docCtx.closePath()
        if (g.kind === 'lasso') docCtx.fill()
        docCtx.stroke()
        docCtx.setLineDash([])
      }
    } else if (g.kind === 'none' && cfg.style === SelectorStyle.Single && this.pointer) {
      // picking indicator ring in single mode
      docCtx.strokeStyle = SEL_OUTLINE
      docCtx.lineWidth = OUTLINE_WIDTH_PX / zoom
      docCtx.beginPath()
      docCtx.arc(this.pointer.x, this.pointer.y, SINGLE_CIRCLE_RADIUS_PX / zoom, 0, Math.PI * 2)
      docCtx.stroke()
    }
    docCtx.restore()

    // selection chrome: hidden while marquee/lasso/path are in flight
    const showChrome = g.kind === 'none' || g.kind === 'rotate' || g.kind === 'scale' || g.kind === 'translate'
    if (showChrome && ctx.engine.store.selected.size) {
      const layout = this.handleLayout(ctx)
      if (!layout) return
      const b = layout.rect
      docCtx.save()
      this.drawSelectBox(docCtx, b, true, zoom)

      // rotate (circle) node
      const rotState = g.kind === 'rotate' ? 'down' : this.hoverHandle === 'rotate' ? 'prox' : 'up'
      this.drawCircleNode(docCtx, layout.rotate, zoom, rotState)

      // resize (square) nodes
      for (const [id, pos] of layout.corners) {
        const st = g.kind === 'scale' && this.downHandle === id ? 'down' : this.hoverHandle === id ? 'prox' : 'up'
        this.drawSquareNode(docCtx, pos, zoom, st)
      }
      docCtx.restore()
    }
  }

  private drawSelectBox(docCtx: CanvasRenderingContext2D, b: Aabb, solid: boolean, zoom: number) {
    docCtx.fillStyle = SEL_FILL
    docCtx.fillRect(b.min.x, b.min.y, b.width(), b.height())
    docCtx.strokeStyle = SEL_OUTLINE
    docCtx.lineWidth = OUTLINE_WIDTH_PX / zoom
    if (solid) {
      docCtx.setLineDash([])
    } else {
      docCtx.setLineDash(DASH_PATTERN.map((x) => x / zoom) as [number, number])
    }
    docCtx.strokeRect(b.min.x, b.min.y, b.width(), b.height())
    docCtx.setLineDash([])
  }

  private drawSquareNode(docCtx: CanvasRenderingContext2D, pos: Vec2, zoom: number, state: 'up' | 'prox' | 'down') {
    const half = NODE_HALF_PX / zoom
    const r = 1 / zoom
    const x = pos.x - half
    const y = pos.y - half
    const s = half * 2
    docCtx.save()
    docCtx.beginPath()
    if (typeof docCtx.roundRect === 'function') docCtx.roundRect(x, y, s, s, r)
    else docCtx.rect(x, y, s, s)
    docCtx.fillStyle = NODE_BG
    docCtx.fill()
    if (state === 'prox') {
      docCtx.fillStyle = NODE_FILL_PROXIMITY
      docCtx.fill()
    } else if (state === 'down') {
      docCtx.fillStyle = NODE_FILL_DOWN
      docCtx.fill()
    }
    docCtx.lineWidth = 1.5 / zoom
    docCtx.strokeStyle = NODE_OUTLINE
    docCtx.stroke()
    docCtx.restore()
  }

  private drawCircleNode(docCtx: CanvasRenderingContext2D, pos: Vec2, zoom: number, state: 'up' | 'prox' | 'down') {
    const radius = NODE_HALF_PX / zoom
    docCtx.save()
    docCtx.beginPath()
    docCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2)
    docCtx.fillStyle = NODE_BG
    docCtx.fill()
    if (state === 'prox') {
      docCtx.fillStyle = NODE_FILL_PROXIMITY
      docCtx.fill()
    } else if (state === 'down') {
      docCtx.fillStyle = NODE_FILL_DOWN
      docCtx.fill()
    }
    docCtx.lineWidth = 1.5 / zoom
    docCtx.strokeStyle = NODE_OUTLINE
    docCtx.stroke()
    docCtx.restore()
  }

  cursor(ctx: PenContext, p: PointerInfo): string {
    if (this.gesture.kind !== 'none') return 'grabbing'
    const h = this.hitHandle(ctx, p.docPos)
    if (h === 'rotate') return 'crosshair'
    if (h === 'tl' || h === 'br') return 'nwse-resize'
    if (h === 'tr' || h === 'bl') return 'nesw-resize'
    const hits = ctx.engine.store.hitTestPoint(p.docPos, 0, ctx.engine.camera.zoom, true)
    if (hits.length && ctx.engine.store.isSelected(hits[0])) return 'move'
    return 'default'
  }

  cancel(ctx: PenContext) {
    this.gesture = { kind: 'none' }
    this.downHandle = null
    ctx.render()
  }
}
