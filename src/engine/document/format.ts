// Port of rnote-engine document/format.rs (page size, orientation, dpi).

import { Vec2 } from '../../compose/geometry'
import { Color, GNOME_BRIGHTS } from '../../compose/style/color'

export enum Orientation {
  Portrait = 'portrait',
  Landscape = 'landscape'
}

export enum MeasureUnit {
  Px = 'px',
  Mm = 'mm',
  Cm = 'cm'
}

export enum FormatPredefined {
  A2 = 'a2',
  A3 = 'a3',
  A4 = 'a4',
  A5 = 'a5',
  A6 = 'a6',
  Letter = 'us_letter',
  Legal = 'us_legal',
  Custom = 'custom'
}

export const FORMAT_PREDEFINED_LABELS: Record<FormatPredefined, string> = {
  [FormatPredefined.A2]: 'A2',
  [FormatPredefined.A3]: 'A3',
  [FormatPredefined.A4]: 'A4',
  [FormatPredefined.A5]: 'A5',
  [FormatPredefined.A6]: 'A6',
  [FormatPredefined.Letter]: 'US Letter',
  [FormatPredefined.Legal]: 'US Legal',
  [FormatPredefined.Custom]: 'Custom'
}

// Sizes in millimetres (portrait).
const MM: Record<string, [number, number]> = {
  a2: [420, 594],
  a3: [297, 420],
  a4: [210, 297],
  a5: [148, 210],
  a6: [105, 148],
  us_letter: [215.9, 279.4],
  us_legal: [215.9, 355.6]
}

export class Format {
  width = 1123
  height = 1587
  dpi = 96
  orientation: Orientation = Orientation.Portrait
  predefined: FormatPredefined = FormatPredefined.A3
  borderColor: Color = GNOME_BRIGHTS[2]
  showBorder = true

  static WIDTH_MIN = 1
  static WIDTH_MAX = 30000
  static HEIGHT_MIN = 1
  static HEIGHT_MAX = 30000
  static DPI_MIN = 1
  static DPI_MAX = 5000
  static DPI_DEFAULT = 96
  static AMOUNT_MM_IN_INCH = 25.4

  static default(): Format {
    return new Format()
  }

  clone(): Format {
    const f = new Format()
    f.width = this.width
    f.height = this.height
    f.dpi = this.dpi
    f.orientation = this.orientation
    f.predefined = this.predefined
    f.borderColor = this.borderColor.clone()
    f.showBorder = this.showBorder
    return f
  }

  setWidth(w: number) {
    this.width = clamp(w, Format.WIDTH_MIN, Format.WIDTH_MAX)
    this.orientation = this.determineOrientation()
    this.predefined = FormatPredefined.Custom
  }
  setHeight(h: number) {
    this.height = clamp(h, Format.HEIGHT_MIN, Format.HEIGHT_MAX)
    this.orientation = this.determineOrientation()
    this.predefined = FormatPredefined.Custom
  }
  setDpi(d: number) {
    this.dpi = clamp(d, Format.DPI_MIN, Format.DPI_MAX)
  }

  determineOrientation(): Orientation {
    return this.width > this.height ? Orientation.Landscape : Orientation.Portrait
  }

  applyPredefined(pre: FormatPredefined, dpi = this.dpi) {
    if (pre === FormatPredefined.Custom) {
      this.predefined = pre
      return
    }
    const [wmm, hmm] = MM[pre]
    let w = mmToPx(wmm, dpi)
    let h = mmToPx(hmm, dpi)
    if (this.orientation === Orientation.Landscape) [w, h] = [h, w]
    this.width = Math.round(w)
    this.height = Math.round(h)
    this.dpi = dpi
    this.predefined = pre
  }

  setOrientation(o: Orientation) {
    if (o !== this.orientation) {
      const t = this.width
      this.width = this.height
      this.height = t
    }
    this.orientation = o
  }

  sizeMm(): Vec2 {
    return new Vec2(pxToMm(this.width, this.dpi), pxToMm(this.height, this.dpi))
  }

  toJSON() {
    return {
      width: this.width,
      height: this.height,
      dpi: this.dpi,
      orientation: this.orientation,
      predefined: this.predefined,
      border_color: this.borderColor.toJSON(),
      show_border: this.showBorder
    }
  }

  static fromJSON(o: any): Format {
    const f = new Format()
    if (!o) return f
    f.width = num(o.width, 1123)
    f.height = num(o.height, 1587)
    f.dpi = num(o.dpi, 96)
    f.orientation = o.orientation ?? Orientation.Portrait
    f.predefined = o.predefined ?? FormatPredefined.A3
    f.borderColor = o.border_color ? Color.fromJSON(o.border_color) : GNOME_BRIGHTS[2]
    f.showBorder = o.show_border ?? true
    return f
  }
}

export function mmToPx(mm: number, dpi: number): number {
  return (mm / Format.AMOUNT_MM_IN_INCH) * dpi
}
export function pxToMm(px: number, dpi: number): number {
  return (px / dpi) * Format.AMOUNT_MM_IN_INCH
}
export function cmToPx(cm: number, dpi: number): number {
  return mmToPx(cm * 10, dpi)
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
function num(v: any, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}
