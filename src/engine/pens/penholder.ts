// Port of rnote-engine pens/penholder.rs: owns one instance of every pen and
// returns the active one based on current PenStyle / PenMode.

import { PenStyle, PenMode } from './pensconfig'
import type { Pen } from './pen'
import { BrushPen } from './brushpen'
import { ShaperPen } from './shaperpen'
import { EraserPen } from './eraserpen'
import { SelectorPen } from './selectorpen'
import { TypewriterPen } from './typewriterpen'
import { ToolsPen } from './toolspen'
import type { Engine } from '../engine'

export class PenHolder {
  brush = new BrushPen()
  shaper = new ShaperPen()
  typewriter = new TypewriterPen()
  eraser = new EraserPen()
  selector = new SelectorPen()
  tools = new ToolsPen()

  active(engine: Engine): Pen {
    if (engine.penMode === PenMode.Eraser) return this.eraser
    switch (engine.currentPen) {
      case PenStyle.Brush:
        return this.brush
      case PenStyle.Shaper:
        return this.shaper
      case PenStyle.Typewriter:
        return this.typewriter
      case PenStyle.Eraser:
        return this.eraser
      case PenStyle.Selector:
        return this.selector
      case PenStyle.Tools:
        return this.tools
      default:
        return this.brush
    }
  }

  get(style: PenStyle): Pen {
    switch (style) {
      case PenStyle.Brush:
        return this.brush
      case PenStyle.Shaper:
        return this.shaper
      case PenStyle.Typewriter:
        return this.typewriter
      case PenStyle.Eraser:
        return this.eraser
      case PenStyle.Selector:
        return this.selector
      case PenStyle.Tools:
        return this.tools
    }
  }

  cancelAll(ctx: any) {
    ;[this.brush, this.shaper, this.eraser, this.selector, this.tools].forEach((p) => p.cancel?.(ctx))
  }
}
