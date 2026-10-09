// Shaper pen (rnote pens/shaper.rs): drag and multi-click shape builders.

import { Vec2 } from '../../compose/geometry'
import { ShapeBuilder, DRAG_BUILDERS } from '../../compose/shapes/builders'
import { ShapeStroke } from '../strokes/shapestroke'
import { PenStyle, ShaperStyleKind } from './pensconfig'
import type { Pen, PenContext, PointerInfo } from './pen'

export class ShaperPen implements Pen {
  name = PenStyle.Shaper
  private builder: ShapeBuilder | null = null
  private dragging = false

  private makeBuilder(ctx: PenContext): ShapeBuilder {
    const cfg = ctx.engine.pensConfig.shaper
    return new ShapeBuilder(cfg.builderType, cfg.constraints.clone())
  }

  onDown(ctx: PenContext, p: PointerInfo) {
    const cfg = ctx.engine.pensConfig.shaper
    cfg.newSeeds()
    if (DRAG_BUILDERS.has(cfg.builderType)) {
      this.builder = this.makeBuilder(ctx)
      this.builder.begin(p.docPos)
      this.dragging = true
    } else {
      // multi-click builder
      if (!this.builder) this.builder = this.makeBuilder(ctx)
      const done = this.builder.addAnchor(p.docPos, p.shift)
      if (done) this.commit(ctx)
    }
    ctx.render()
  }

  onMove(ctx: PenContext, p: PointerInfo) {
    if (this.builder) {
      if (this.dragging || !DRAG_BUILDERS.has(ctx.engine.pensConfig.shaper.builderType)) {
        this.builder.update(p.docPos, p.shift)
        ctx.render()
      }
    }
  }

  onUp(ctx: PenContext) {
    if (this.dragging && this.builder) {
      this.dragging = false
      this.commit(ctx)
    }
  }

  onDouble(ctx: PenContext, p: PointerInfo) {
    if (this.builder && this.builder.doubleClick(p.docPos)) {
      this.commit(ctx)
    }
  }

  onKeyDown(ctx: PenContext, e: KeyboardEvent) {
    if (e.key === 'Enter' && this.builder && !DRAG_BUILDERS.has(ctx.engine.pensConfig.shaper.builderType)) {
      if (this.builder.anchors.length >= 2) {
        this.builder.finished = true
        this.commit(ctx)
      }
      e.preventDefault()
    } else if (e.key === 'Escape') {
      this.builder = null
      ctx.render()
    } else if (e.key === 'Backspace' && this.builder) {
      this.builder.anchors.pop()
      ctx.render()
    }
  }

  private commit(ctx: PenContext) {
    if (!this.builder) return
    const shapes = this.builder.build()
    this.builder = null
    if (!shapes.length) {
      ctx.render()
      return
    }
    const cfg = ctx.engine.pensConfig.shaper
    const stroke = new ShapeStroke(shapes, {
      smooth: cfg.smoothOptions.clone(),
      rough: cfg.roughOptions.clone(),
      roughEnabled: cfg.style === ShaperStyleKind.Rough,
      highlightMode: cfg.highlightMode,
      highlightOpacity: cfg.highlightOpacity
    })
    ctx.engine.commitAddStroke(stroke)
    ctx.render()
  }

  cancel(ctx: PenContext) {
    this.builder = null
    this.dragging = false
    ctx.render()
  }

  drawOverlay(docCtx: CanvasRenderingContext2D, ctx: PenContext) {
    if (!this.builder) return
    const cfg = ctx.engine.pensConfig.shaper
    const shapes = this.builder.preview()
    const style = {
      stroke: cfg.smoothOptions,
      rough: cfg.roughOptions,
      roughEnabled: cfg.style === ShaperStyleKind.Rough
    }
    docCtx.save()
    if (cfg.highlightMode) docCtx.globalAlpha = cfg.highlightOpacity
    for (const s of shapes) s.draw(docCtx, style)
    docCtx.restore()

    // anchor indicators for multi-click builders
    if (!DRAG_BUILDERS.has(cfg.builderType)) {
      docCtx.save()
      docCtx.fillStyle = '#1c71d8'
      docCtx.strokeStyle = '#ffffff'
      docCtx.lineWidth = 1.5
      for (const a of this.builder.anchors) {
        docCtx.beginPath()
        docCtx.arc(a.x, a.y, 4, 0, Math.PI * 2)
        docCtx.fill()
        docCtx.stroke()
      }
      docCtx.restore()
    }
  }

  cursor() {
    return 'crosshair'
  }
}
