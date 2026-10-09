// Brush pen (rnote pens/brush.rs): solid pen, marker (highlighter), textured.

import { Vec2 } from '../../compose/geometry'
import { PenPath, Element, PenPathBuilderType } from '../../compose/penpath/penpath'
import { ActiveSmoothRenderer, drawTexturedBrush } from '../../compose/style/brush-render'
import { BrushStroke, BrushStyleKind } from '../strokes/brushstroke'
import { penAudio } from '../audio-player'
import { PenStyle } from './pensconfig'
import type { Pen, PenContext, PointerInfo } from './pen'

export class BrushPen implements Pen {
  name = PenStyle.Brush
  private path: PenPath | null = null
  private drawing = false
  private lastPos: Vec2 | null = null
  private smoothedPressure = 0.5
  private pressureCapable = false
  private activeRenderer = new ActiveSmoothRenderer()

  // Desktop Rnote records raw stylus pressure; geometry smoothing belongs to
  // the PenPath builder rather than a separate pressure filter.
  private smooth(p: PointerInfo): number {
    return pressureOf(p)
  }

  onDown(ctx: PenContext, p: PointerInfo) {
    const cfg = ctx.engine.pensConfig.brush
    cfg.newSeeds()
    this.activeRenderer.reset()
    this.path = new PenPath([], cfg.builderType)
    this.pressureCapable = p.pointerType === 'pen' && p.pressure > 0
    this.smoothedPressure = pressureOf(p)
    this.path.addElement(new Element(p.docPos.clone(), pressureOf(p)))
    this.drawing = true
    this.lastPos = p.docPos.clone()
    if (ctx.engine.settings.penSounds) {
      if (cfg.style === BrushStyleKind.Marker) penAudio.markerSound()
      else penAudio.brushSound()
    }
    ctx.render()
  }

  onMove(ctx: PenContext, p: PointerInfo) {
    if (!this.drawing || !this.path) return
    this.path.addElement(new Element(p.docPos.clone(), this.smooth(p)))
    this.lastPos = p.docPos.clone()
    if (ctx.engine.settings.penSounds && ctx.engine.pensConfig.brush.style !== BrushStyleKind.Marker) {
      penAudio.brushSound()
    }
    ctx.render()
  }

  onUp(ctx: PenContext, p: PointerInfo) {
    if (!this.drawing || !this.path) return
    this.drawing = false
    const cfg = ctx.engine.pensConfig.brush
    // Desktop's PenEvent::Up carries the up element: append it so a fast flick
    // with no intermediate move still draws a line (down -> up) instead of
    // collapsing into a dot. addElement merges near-coincident points, leaving a
    // genuine tap with a single element that renders as the tap dot.
    if (p) this.path.addElement(new Element(p.docPos.clone(), pressureOf(p)))
    if (this.path.elements.length > 0) {
      const stroke = new BrushStroke(
        this.path,
        cfg.style,
        cfg.activeSmoothOptions().clone(),
        cfg.texturedOptions.clone()
      )
      ctx.engine.commitAddStroke(stroke)
    }
    this.path = null
    ctx.render()
  }

  cancel(ctx: PenContext) {
    this.drawing = false
    this.path = null
    ctx.render()
  }

  drawOverlay(docCtx: CanvasRenderingContext2D, ctx: PenContext) {
    if (!this.path) return
    const cfg = ctx.engine.pensConfig.brush
    if (cfg.style === BrushStyleKind.Textured) {
      drawTexturedBrush(docCtx, this.path, cfg.texturedOptions)
    } else {
      this.activeRenderer.draw(docCtx, this.path, cfg.activeSmoothOptions(), cfg.style === BrushStyleKind.Marker)
    }
  }

  cursor() {
    return 'crosshair'
  }
}

export function pressureOf(p: PointerInfo): number {
  if (p.pointerType === 'pen') return p.pressure > 0 ? p.pressure : 0.5
  // Mouse / touch use Element::PRESSURE_DEFAULT from desktop Rnote.
  return 0.5
}
