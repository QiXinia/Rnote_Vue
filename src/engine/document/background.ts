// Port of rnote-engine document/background.rs.

import { Vec2, Aabb } from '../../compose/geometry'
import { Color, GNOME_BRIGHTS } from '../../compose/style/color'

export enum PatternStyle {
  None = 'none',
  Lines = 'lines',
  Grid = 'grid',
  Dots = 'dots',
  IsometricGrid = 'isometric_grid',
  IsometricDots = 'isometric_dots'
}

export const PATTERN_LABELS: Record<PatternStyle, string> = {
  [PatternStyle.None]: 'None',
  [PatternStyle.Lines]: 'Lines',
  [PatternStyle.Grid]: 'Grid',
  [PatternStyle.Dots]: 'Dots',
  [PatternStyle.IsometricGrid]: 'Isometric Grid',
  [PatternStyle.IsometricDots]: 'Isometric Dots'
}

export class Background {
  color: Color = Color.WHITE
  pattern: PatternStyle = PatternStyle.Dots
  patternSize: Vec2 = new Vec2(32, 32)
  patternColor: Color = new Color(0.8, 0.9, 1.0, 1.0)

  static COLOR_DEFAULT = Color.WHITE
  static PATTERN_SIZE_DEFAULT = new Vec2(32, 32)
  static PATTERN_COLOR_DEFAULT = new Color(0.8, 0.9, 1.0, 1.0)
  static LINE_WIDTH = 0.5
  static DOTS_WIDTH = 1.5

  clone(): Background {
    const b = new Background()
    b.color = this.color.clone()
    b.pattern = this.pattern
    b.patternSize = this.patternSize.clone()
    b.patternColor = this.patternColor.clone()
    return b
  }

  // Renders the background fill + pattern within a rectangle in document
  // coordinates. For infinite layouts the rectangle is the visible viewport.
  draw(
    ctx: CanvasRenderingContext2D,
    rect: Aabb,
    opts?: { withPattern?: boolean; optimizePrinting?: boolean }
  ) {
    const withPattern = opts?.withPattern ?? true
    const optimize = opts?.optimizePrinting ?? false
    const [bgColor, patColor] = this.resolveColors(optimize)
    ctx.save()
    // base fill
    ctx.fillStyle = bgColor.toCss()
    ctx.fillRect(rect.min.x, rect.min.y, rect.width(), rect.height())

    if (withPattern && this.pattern !== PatternStyle.None) {
      if (
        this.pattern === PatternStyle.Dots ||
        this.pattern === PatternStyle.Lines ||
        this.pattern === PatternStyle.Grid
      ) {
        // Native tiled pattern: one fillRect instead of thousands of per-dot
        // fills (the old per-dot loop caused occasional 50ms+ stalls).
        ctx.fillStyle = this.ensureTilePattern()
        ctx.fillRect(rect.min.x, rect.min.y, rect.width(), rect.height())
      } else {
        ctx.fillStyle = patColor.toCss()
        ctx.strokeStyle = patColor.toCss()
        this.drawPattern(ctx, rect)
      }
    }
    ctx.restore()
  }

  // Cached CanvasPattern tile for dots/lines/grid. Rebuilt only when the style,
  // size or colour changes; pattern space is document units so it scales
  // losslessly with the canvas transform (like rnote's repeating background).
  private tile: CanvasPattern | null = null
  private tileKey = ''
  private ensureTilePattern(): CanvasPattern {
    const sx = Math.max(this.patternSize.x, 2)
    const sy = Math.max(this.patternSize.y, 2)
    const col = this.patternColor.toCss()
    const key = `${this.pattern}|${sx}|${sy}|${col}`
    if (this.tile && key === this.tileKey) return this.tile
    const cnv = document.createElement('canvas')
    cnv.width = Math.max(1, Math.round(sx))
    cnv.height = Math.max(1, Math.round(sy))
    const c = cnv.getContext('2d')!
    if (this.pattern === PatternStyle.Dots) {
      c.fillStyle = col
      c.beginPath()
      c.arc(sx / 2, sy / 2, Background.DOTS_WIDTH, 0, Math.PI * 2)
      c.fill()
    } else {
      c.strokeStyle = col
      c.lineWidth = Background.LINE_WIDTH
      c.beginPath()
      if (this.pattern === PatternStyle.Lines) {
        c.moveTo(0, sy)
        c.lineTo(sx, sy)
      } else {
        c.moveTo(sx, 0)
        c.lineTo(sx, sy)
        c.moveTo(0, sy)
        c.lineTo(sx, sy)
      }
      c.stroke()
    }
    this.tile = cnv.getContext('2d')!.createPattern(cnv, 'repeat')
    this.tileKey = key
    return this.tile!
  }

  // Port of background.rs gen_svg color selection: when optimizing for printing
  // the background is forced white and the pattern color is brightness-inverted
  // only when the original background is dark.
  private resolveColors(optimize: boolean): [Color, Color] {
    if (!optimize) return [this.color, this.patternColor]
    if (this.color.luma() > 0.5) return [Color.WHITE, this.patternColor]
    return [Color.WHITE, this.patternColor.toInvertedBrightnessColor()]
  }

  private drawPattern(ctx: CanvasRenderingContext2D, rect: Aabb) {
    const sx = Math.max(this.patternSize.x, 2)
    const sy = Math.max(this.patternSize.y, 2)
    const x0 = Math.floor(rect.min.x / sx) * sx
    const y0 = Math.floor(rect.min.y / sy) * sy

    switch (this.pattern) {
      case PatternStyle.Lines: {
        ctx.lineWidth = Background.LINE_WIDTH
        ctx.beginPath()
        for (let y = y0; y <= rect.max.y; y += sy) {
          ctx.moveTo(rect.min.x, y)
          ctx.lineTo(rect.max.x, y)
        }
        ctx.stroke()
        break
      }
      case PatternStyle.Grid: {
        ctx.lineWidth = Background.LINE_WIDTH
        ctx.beginPath()
        for (let x = x0; x <= rect.max.x; x += sx) {
          ctx.moveTo(x, rect.min.y)
          ctx.lineTo(x, rect.max.y)
        }
        for (let y = y0; y <= rect.max.y; y += sy) {
          ctx.moveTo(rect.min.x, y)
          ctx.lineTo(rect.max.x, y)
        }
        ctx.stroke()
        break
      }
      case PatternStyle.Dots: {
        const r = Background.DOTS_WIDTH
        for (let x = x0; x <= rect.max.x; x += sx) {
          for (let y = y0; y <= rect.max.y; y += sy) {
            ctx.beginPath()
            ctx.arc(x, y, r, 0, Math.PI * 2)
            ctx.fill()
          }
        }
        break
      }
      case PatternStyle.IsometricGrid:
      case PatternStyle.IsometricDots: {
        const h = sy
        const w = Math.sqrt(3) * h
        const dots = this.pattern === PatternStyle.IsometricDots
        ctx.lineWidth = Background.LINE_WIDTH
        for (let row = Math.floor(rect.min.y / h) - 1; row <= Math.ceil(rect.max.y / h) + 1; row++) {
          const y = row * h
          const offset = (row & 1) === 0 ? 0 : w / 2
          for (let col = Math.floor(rect.min.x / w) - 1; col <= Math.ceil(rect.max.x / w) + 1; col++) {
            const x = col * w + offset
            if (dots) {
              ctx.beginPath()
              ctx.arc(x, y, Background.DOTS_WIDTH, 0, Math.PI * 2)
              ctx.fill()
            } else {
              // triangle grid edges
              ctx.beginPath()
              ctx.moveTo(x, y)
              ctx.lineTo(x + w / 2, y - h / 2)
              ctx.moveTo(x, y)
              ctx.lineTo(x + w / 2, y + h / 2)
              ctx.moveTo(x, y)
              ctx.lineTo(x + w, y)
              ctx.stroke()
            }
          }
        }
        break
      }
    }
  }

  toSVG(rect: Aabb, opts?: { withPattern?: boolean; optimizePrinting?: boolean }): string {
    const withPattern = opts?.withPattern ?? true
    const optimize = opts?.optimizePrinting ?? false
    const [bgColor, patColor] = this.resolveColors(optimize)
    let s = `<rect x="${r(rect.min.x)}" y="${r(rect.min.y)}" width="${r(rect.width())}" height="${r(rect.height())}" fill="${bgColor.toHex()}"/>`
    if (!withPattern || this.pattern === PatternStyle.None) return s
    const sx = Math.max(this.patternSize.x, 2)
    const sy = Math.max(this.patternSize.y, 2)
    const col = patColor.toHex()
    s += `<defs><pattern id="bgpat" width="${r(sx)}" height="${r(sy)}" patternUnits="userSpaceOnUse">`
    if (this.pattern === PatternStyle.Lines) {
      s += `<path d="M0 ${r(sy)} L${r(sx)} ${r(sy)}" stroke="${col}" stroke-width="${Background.LINE_WIDTH}" fill="none"/>`
    } else if (this.pattern === PatternStyle.Grid) {
      s += `<path d="M${r(sx)} 0 L${r(sx)} ${r(sy)} M0 ${r(sy)} L${r(sx)} ${r(sy)}" stroke="${col}" stroke-width="${Background.LINE_WIDTH}" fill="none"/>`
    } else if (this.pattern === PatternStyle.Dots) {
      s += `<circle cx="${r(sx / 2)}" cy="${r(sy / 2)}" r="${Background.DOTS_WIDTH}" fill="${col}"/>`
    }
    s += `</pattern></defs>`
    s += `<rect x="${r(rect.min.x)}" y="${r(rect.min.y)}" width="${r(rect.width())}" height="${r(rect.height())}" fill="url(#bgpat)"/>`
    return s
  }

  toJSON() {
    return {
      color: this.color.toJSON(),
      pattern: this.pattern,
      pattern_size: { x: this.patternSize.x, y: this.patternSize.y },
      pattern_color: this.patternColor.toJSON()
    }
  }

  static fromJSON(o: any): Background {
    const b = new Background()
    if (!o) return b
    b.color = o.color ? Color.fromJSON(o.color) : Color.WHITE
    b.pattern = o.pattern ?? PatternStyle.Dots
    b.patternSize = o.pattern_size ? new Vec2(o.pattern_size.x, o.pattern_size.y) : new Vec2(32, 32)
    b.patternColor = o.pattern_color ? Color.fromJSON(o.pattern_color) : Background.PATTERN_COLOR_DEFAULT
    return b
  }
}

function r(v: number): number {
  return Math.round(v * 100) / 100
}

export { GNOME_BRIGHTS }
