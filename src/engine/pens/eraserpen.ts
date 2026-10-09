// Eraser pen (rnote pens/eraser.rs): trash-colliding and split-colliding.

import { Vec2, Aabb } from '../../compose/geometry'
import { BrushStroke } from '../strokes/brushstroke'
import { ShapeStroke } from '../strokes/shapestroke'
import { PenStyle, EraserStyle } from './pensconfig'
import type { Pen, PenContext, PointerInfo } from './pen'

export class EraserPen implements Pen {
  name = PenStyle.Eraser
  private erasing = false
  private cursorPos: Vec2 | null = null
  private erasedThisStroke = new Set<number>()

  private radius(ctx: PenContext): number {
    return ctx.engine.pensConfig.eraser.width * 0.5
  }

  onDown(ctx: PenContext, p: PointerInfo) {
    this.erasing = true
    this.erasedThisStroke.clear()
    this.cursorPos = p.docPos.clone()
    this.apply(ctx, p)
  }

  onMove(ctx: PenContext, p: PointerInfo) {
    this.cursorPos = p.docPos.clone()
    if (this.erasing) this.apply(ctx, p)
    ctx.render()
  }

  onUp(ctx: PenContext) {
    this.erasing = false
    this.erasedThisStroke.clear()
    ctx.render()
  }

  private apply(ctx: PenContext, p: PointerInfo) {
    const engine = ctx.engine
    const cfg = engine.pensConfig.eraser
    const radius = cfg.width * 0.5
    const box = Aabb.fromHalfExtents(p.docPos, new Vec2(radius, radius))
    // Porting the Rust store trash_colliding_strokes: only strokes rendered
    // inside the current viewport are candidates (off-screen strokes can't be
    // erased or seen), the eraser ignores text/vector/bitmap strokes, and each
    // candidate is bounds-culled cheaply before the precise hit test.
    const viewport = engine.camera.visibleDocBounds().extend_by(2)

    const toRemove: number[] = []
    const replacements: { id: number; strokes: BrushStroke[] }[] = []

    for (const stroke of engine.store.all()) {
      if (this.erasedThisStroke.has(stroke.id)) continue
      if (!(stroke instanceof BrushStroke) && !(stroke instanceof ShapeStroke)) continue
      const b = stroke.bounds()
      if (!viewport.intersects(b) || !box.intersects(b)) continue
      let hit = false
      if (stroke instanceof BrushStroke) {
        hit = stroke.intersectsEraser(p.docPos, radius)
      } else if (stroke instanceof ShapeStroke) {
        hit = stroke.intersectsEraser(p.docPos, radius)
      }
      if (!hit) continue

      if (cfg.style === EraserStyle.SplitColliding && stroke instanceof BrushStroke) {
        const parts = stroke.splitByEraser(p.docPos, radius)
        if (parts.length === 0) toRemove.push(stroke.id)
        else replacements.push({ id: stroke.id, strokes: parts })
      } else {
        toRemove.push(stroke.id)
      }
      this.erasedThisStroke.add(stroke.id)
    }

    if (toRemove.length) {
      const removed = toRemove.map((id) => engine.store.get(id)!.toJSON())
      engine.store.removeStrokes(toRemove)
      engine.history.push({
        label: 'Erase Strokes',
        coalesceKey: 'eraser-gesture',
        undo: () => {
          for (const j of removed) engine.store.addStroke(hydrate(j)!)
        },
        redo: () => engine.store.removeStrokes(toRemove)
      })
    }
    for (const rep of replacements) {
      const original = engine.store.get(rep.id)
      const originalJson = original?.toJSON()
      engine.store.remove(rep.id)
      engine.store.addStrokes(rep.strokes)
      engine.history.push({
        label: 'Split Strokes',
        coalesceKey: 'eraser-gesture',
        undo: () => {
          engine.store.removeStrokes(rep.strokes.map((s) => s.id))
          if (originalJson) engine.store.addStroke(hydrate(originalJson)!)
        },
        redo: () => {
          engine.store.remove(rep.id)
          engine.store.addStrokes(rep.strokes)
        }
      })
    }
    if (toRemove.length || replacements.length) engine.notify()
  }

  drawOverlay(docCtx: CanvasRenderingContext2D, ctx: PenContext) {
    if (!this.cursorPos) return
    const r = this.radius(ctx)
    docCtx.save()
    docCtx.strokeStyle = 'rgba(0,0,0,0.55)'
    docCtx.fillStyle = 'rgba(255,255,255,0.25)'
    docCtx.lineWidth = 1.5 / ctx.engine.camera.zoom
    docCtx.beginPath()
    docCtx.arc(this.cursorPos.x, this.cursorPos.y, r, 0, Math.PI * 2)
    docCtx.fill()
    docCtx.stroke()
    docCtx.restore()
  }

  cursor() {
    return 'none'
  }

  cancel(ctx: PenContext) {
    this.erasing = false
    this.cursorPos = null
    ctx.render()
  }
}

import { hydrateStroke as hydrate } from '../strokes/index'
