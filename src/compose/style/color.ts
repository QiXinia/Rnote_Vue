// Port of rnote-compose Color (piet::Color wrapper) + GNOME palette.
// Components are stored as linear-ish 0..1 floats like piet; for canvas we
// convert to sRGB css strings. Rnote stores straight components in 0..1.

export interface ColorLike {
  r: number
  g: number
  b: number
  a: number
}

export class Color {
  r: number
  g: number
  b: number
  a: number

  constructor(r = 0, g = 0, b = 0, a = 1) {
    this.r = clamp01(r)
    this.g = clamp01(g)
    this.b = clamp01(b)
    this.a = clamp01(a)
  }

  static get BLACK(): Color {
    return new Color(0, 0, 0, 1)
  }
  static get WHITE(): Color {
    return new Color(1, 1, 1, 1)
  }
  static get TRANSPARENT(): Color {
    return new Color(0, 0, 0, 0)
  }
  static get RED(): Color {
    return new Color(1, 0, 0, 1)
  }
  static get GREEN(): Color {
    return new Color(0, 0.5, 0, 1)
  }
  static get BLUE(): Color {
    return new Color(0, 0, 1, 1)
  }

  static fromRgba8(r: number, g: number, b: number, a = 255): Color {
    return new Color(r / 255, g / 255, b / 255, a / 255)
  }

  static fromHex(hex: string): Color {
    let h = hex.trim().replace(/^#/, '')
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    if (h.length === 4) h = h.split('').map((c) => c + c).join('')
    if (h.length === 6) h += 'ff'
    const n = parseInt(h, 16)
    if (Number.isNaN(n) || h.length !== 8) return Color.BLACK
    return new Color(((n >>> 24) & 255) / 255, ((n >>> 16) & 255) / 255, ((n >>> 8) & 255) / 255, (n & 255) / 255)
  }

  static fromCss(color: string): Color {
    if (color.startsWith('#')) return Color.fromHex(color)
    const m = color.match(/rgba?\(([^)]+)\)/)
    if (m) {
      const parts = m[1].split(',').map((s) => parseFloat(s.trim()))
      return new Color(parts[0] / 255, parts[1] / 255, parts[2] / 255, parts[3] === undefined ? 1 : parts[3])
    }
    return Color.BLACK
  }

  clone(): Color {
    return new Color(this.r, this.g, this.b, this.a)
  }

  withAlpha(a: number): Color {
    return new Color(this.r, this.g, this.b, a)
  }
  multiplyAlpha(factor: number): Color {
    return new Color(this.r, this.g, this.b, this.a * factor)
  }

  toRgba8(): [number, number, number, number] {
    return [Math.round(this.r * 255), Math.round(this.g * 255), Math.round(this.b * 255), Math.round(this.a * 255)]
  }

  toHex(withAlpha = true): string {
    const [r, g, b, a] = this.toRgba8()
    const h = (n: number) => n.toString(16).padStart(2, '0')
    return `#${h(r)}${h(g)}${h(b)}${withAlpha && a !== 255 ? h(a) : ''}`
  }

  toHex8(): string {
    const [r, g, b, a] = this.toRgba8()
    const h = (n: number) => n.toString(16).padStart(2, '0')
    return `#${h(r)}${h(g)}${h(b)}${h(a)}`
  }

  toCss(alphaOverride?: number): string {
    const a = alphaOverride !== undefined ? clamp01(alphaOverride) : this.a
    const [r, g, b] = this.toRgba8()
    return a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${round3(a)})`
  }

  // Rec. 709 luma used by Rnote for contrast decisions.
  luma(): number {
    return 0.2126 * this.r + 0.7152 * this.g + 0.0722 * this.b
  }

  isDark(): boolean {
    return this.luma() < 0.5
  }

  toInvertedBrightnessColor(): Color {
    return new Color(1 - this.r, 1 - this.g, 1 - this.b, this.a)
  }

  toGrayscale(luma: number): Color {
    return new Color(luma, luma, luma, this.a)
  }

  toBlackOrWhite(): Color {
    return this.isDark() ? Color.WHITE : Color.BLACK
  }

  toContrastColor(): Color {
    return this.toBlackOrWhite()
  }

  toFontColor(): Color {
    return this.toBlackOrWhite()
  }

  toColorString(): string {
    return this.toCss()
  }

  equals(o: Color): boolean {
    return this.r === o.r && this.g === o.g && this.b === o.b && this.a === o.a
  }

  toJSON(): ColorLike {
    return { r: round3(this.r), g: round3(this.g), b: round3(this.b), a: round3(this.a) }
  }

  static fromJSON(o: ColorLike | string): Color {
    if (typeof o === 'string') return Color.fromHex(o)
    if (!o) return Color.BLACK
    return new Color(o.r, o.g, o.b, o.a ?? 1)
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

// GNOME palette (matches rnote-compose color.rs).
const rgb8 = Color.fromRgba8
export const GNOME_BLUES = [rgb8(0x99, 0xc1, 0xf1), rgb8(0x62, 0xa0, 0xea), rgb8(0x35, 0x84, 0xe4), rgb8(0x1c, 0x71, 0xd8), rgb8(0x1a, 0x5f, 0xb4)]
export const GNOME_GREENS = [rgb8(0x8f, 0xf0, 0xa4), rgb8(0x57, 0xe3, 0x89), rgb8(0x33, 0xd1, 0x7a), rgb8(0x2e, 0xc2, 0x7e), rgb8(0x26, 0xa2, 0x69)]
export const GNOME_YELLOWS = [rgb8(0xf9, 0xf0, 0x6b), rgb8(0xf8, 0xe4, 0x5c), rgb8(0xf6, 0xd3, 0x2d), rgb8(0xf5, 0xc2, 0x11), rgb8(0xe5, 0xa5, 0x0a)]
export const GNOME_ORANGES = [rgb8(0xff, 0xbe, 0x6f), rgb8(0xff, 0xa3, 0x48), rgb8(0xff, 0x78, 0x00), rgb8(0xe6, 0x61, 0x00), rgb8(0xc6, 0x46, 0x00)]
export const GNOME_REDS = [rgb8(0xf6, 0x61, 0x51), rgb8(0xed, 0x33, 0x3b), rgb8(0xe0, 0x1b, 0x24), rgb8(0xc0, 0x1c, 0x28), rgb8(0xa5, 0x1d, 0x2d)]
export const GNOME_PURPLES = [rgb8(0xdc, 0x8a, 0xdd), rgb8(0xc0, 0x61, 0xcb), rgb8(0x91, 0x41, 0xac), rgb8(0x81, 0x3d, 0x9c), rgb8(0x61, 0x35, 0x83)]
export const GNOME_BROWNS = [rgb8(0xcd, 0xab, 0x8f), rgb8(0xb5, 0x83, 0x5a), rgb8(0x98, 0x6a, 0x44), rgb8(0x86, 0x5e, 0x3c), rgb8(0x63, 0x45, 0x2c)]
export const GNOME_BRIGHTS = [rgb8(0xff, 0xff, 0xff), rgb8(0xf6, 0xf5, 0xf4), rgb8(0xde, 0xdd, 0xda), rgb8(0xc0, 0xbf, 0xbc), rgb8(0x9a, 0x99, 0x96)]
export const GNOME_DARKS = [rgb8(0x77, 0x76, 0x7b), rgb8(0x5e, 0x5c, 0x64), rgb8(0x3d, 0x38, 0x46), rgb8(0x24, 0x1f, 0x31), rgb8(0x00, 0x00, 0x00)]

// The exact color list shown in rnote's color picker (favorites row + groups).
export const COLOR_PICKER_SWATCHES: Color[][] = [
  GNOME_BRIGHTS,
  GNOME_DARKS,
  GNOME_BLUES,
  GNOME_GREENS,
  GNOME_YELLOWS,
  GNOME_ORANGES,
  GNOME_REDS,
  GNOME_PURPLES,
  GNOME_BROWNS
]

// Quick color shortcuts Ctrl+1..9 (rnote default favorites).
export const COLOR_SHORTCUT_COLORS: Color[] = [
  Color.BLACK,
  GNOME_DARKS[2],
  GNOME_REDS[2],
  GNOME_ORANGES[2],
  GNOME_YELLOWS[3],
  GNOME_GREENS[2],
  GNOME_BLUES[2],
  GNOME_PURPLES[2],
  Color.WHITE
]
