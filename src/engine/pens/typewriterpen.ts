// Typewriter pen (rnote pens/typewriter): places / edits text strokes. The
// rich-text editing surface is an overlay contenteditable managed by the
// canvas component (beginTextEdit); this pen owns placement and the cursor.

import { Vec2 } from '../../compose/geometry'
import { PenStyle } from './pensconfig'
import type { Pen, PenContext, PointerInfo } from './pen'

export class TypewriterPen implements Pen {
  name = PenStyle.Typewriter
  private pointer: Vec2 | null = null

  onDown(ctx: PenContext, p: PointerInfo) {
    // clicking an existing text stroke edits it; otherwise create a new one
    const hits = ctx.engine.store.hitTestPoint(p.docPos, 8 / ctx.engine.camera.zoom, ctx.engine.camera.zoom, true)
    let existingId: number | undefined
    if (hits.length) {
      const s = ctx.engine.store.get(hits[0])
      if (s && s.kind === 'text') existingId = s.id
    }
    ctx.beginTextEdit(p.docPos.clone(), existingId)
  }

  onMove(ctx: PenContext, p: PointerInfo) {
    this.pointer = p.docPos.clone()
    ctx.render()
  }

  onUp() {}

  drawOverlay(docCtx: CanvasRenderingContext2D, ctx: PenContext) {
    if (!this.pointer) return
    const cfg = ctx.engine.pensConfig.typewriter
    const p = this.pointer
    docCtx.save()
    docCtx.strokeStyle = 'rgba(28,113,216,0.7)'
    docCtx.lineWidth = 1.5 / ctx.engine.camera.zoom
    const w = cfg.textWidth
    docCtx.strokeRect(p.x, p.y, w, cfg.fontSize * 1.4)
    // caret
    docCtx.beginPath()
    docCtx.moveTo(p.x + 2, p.y + 2)
    docCtx.lineTo(p.x + 2, p.y + cfg.fontSize * 1.2)
    docCtx.stroke()
    docCtx.restore()
  }

  cursor() {
    return 'text'
  }
}
