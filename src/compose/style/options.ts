// Ports of rnote-compose style option enums/structs:
// PressureCurve, LineStyle, LineCap, SmoothOptions, TexturedOptions,
// RoughOptions / FillStyle, StrokeLayer, Style.

import { Color } from './color'
import { mulberry32 } from '../geometry'

export enum PressureCurve {
  Const = 'const',
  Linear = 'linear',
  Sqrt = 'sqrt',
  Cbrt = 'cbrt',
  Pow2 = 'pow2',
  Pow3 = 'pow3'
}

export function applyPressureCurve(pressure: number, curve: PressureCurve): number {
  const p = Math.min(1, Math.max(0, pressure))
  switch (curve) {
    case PressureCurve.Const:
      return 1
    case PressureCurve.Linear:
      return p
    case PressureCurve.Sqrt:
      return Math.sqrt(p)
    case PressureCurve.Cbrt:
      return Math.cbrt(p)
    case PressureCurve.Pow2:
      return p * p
    case PressureCurve.Pow3:
      return p * p * p
    default:
      return p
  }
}

export enum LineCap {
  Straight = 'straight',
  Rounded = 'rounded'
}

export enum LineStyle {
  Solid = 'solid',
  Dotted = 'dotted',
  DashedNarrow = 'dashed_narrow',
  DashedEquidistant = 'dashed_equidistant',
  DashedWide = 'dashed_wide'
}

export function isDotted(style: LineStyle): boolean {
  return style === LineStyle.Dotted
}

// Unscaled dash vectors, matching rnote-compose LineStyle::as_unscaled_vector.
export function lineDashVector(style: LineStyle): number[] {
  switch (style) {
    case LineStyle.Dotted:
      return [0, 0]
    case LineStyle.DashedNarrow:
      return [1.0, 0.618]
    case LineStyle.DashedEquidistant:
      return [1.0, 1.0]
    case LineStyle.DashedWide:
      return [1.0, 1.618]
    default:
      return []
  }
}

// Canvas/SVG equivalent of piet StrokeStyle dash pattern. Dotted lines require
// round caps; rounded caps add two stroke widths to every gap in Rnote.
export function pietDashVector(style: LineStyle, strokeWidth: number, lineCap: LineCap): number[] {
  const pattern = lineDashVector(style)
  if (!pattern.length) return []
  const effectiveCap = style === LineStyle.Dotted ? LineCap.Rounded : lineCap
  const scale = strokeWidth * Math.E
  return pattern.map((value, index) => {
    let v = value
    if (effectiveCap === LineCap.Straight) {
      v *= scale
    } else if (style !== LineStyle.Dotted) {
      v *= scale
    }
    if (effectiveCap === LineCap.Rounded && index % 2 === 1) v += 2 * strokeWidth
    return v
  })
}

export enum StrokeLayer {
  // Desktop Rnote draw order: document background content, imported images,
  // marker/highlighter, then ordinary user strokes.
  Document = 'document',
  Image = 'image',
  Highlighter = 'highlighter',
  // Normal strokes carry an optional layer index.
  UserLayer = 'user_layer'
}

export function strokeLayerRank(layer: StrokeLayer | string | undefined): number {
  switch (layer) {
    case StrokeLayer.Document:
      return 0
    case StrokeLayer.Image:
      return 1
    case StrokeLayer.Highlighter:
      return 2
    case StrokeLayer.UserLayer:
    default:
      return 3
  }
}

export interface SmoothOptionsData {
  stroke_width: number
  stroke_color: Color | null
  fill_color: Color | null
  pressure_curve: PressureCurve
  line_style: LineStyle
  line_cap: LineCap
}

export class SmoothOptions implements SmoothOptionsData {
  stroke_width = 2.0
  stroke_color: Color | null = Color.BLACK
  fill_color: Color | null = null
  pressure_curve = PressureCurve.Linear
  line_style = LineStyle.Solid
  line_cap = LineCap.Straight

  static STROKE_WIDTH_MIN = 0.1
  static STROKE_WIDTH_MAX = 500.0

  static default(): SmoothOptions {
    return new SmoothOptions()
  }

  clone(): SmoothOptions {
    const o = new SmoothOptions()
    o.stroke_width = this.stroke_width
    o.stroke_color = this.stroke_color ? this.stroke_color.clone() : null
    o.fill_color = this.fill_color ? this.fill_color.clone() : null
    o.pressure_curve = this.pressure_curve
    o.line_style = this.line_style
    o.line_cap = this.line_cap
    return o
  }

  toJSON() {
    return {
      stroke_width: this.stroke_width,
      stroke_color: this.stroke_color ? this.stroke_color.toJSON() : null,
      fill_color: this.fill_color ? this.fill_color.toJSON() : null,
      pressure_curve: this.pressure_curve,
      line_style: this.line_style,
      line_cap: this.line_cap
    }
  }

  static fromJSON(o: any): SmoothOptions {
    const s = new SmoothOptions()
    if (!o) return s
    s.stroke_width = num(o.stroke_width, 2.0)
    s.stroke_color = o.stroke_color ? Color.fromJSON(o.stroke_color) : null
    s.fill_color = o.fill_color ? Color.fromJSON(o.fill_color) : null
    s.pressure_curve = normalizeEnum(PressureCurve, o.pressure_curve, PressureCurve.Linear)
    s.line_style = normalizeEnum(LineStyle, o.line_style, LineStyle.Solid)
    s.line_cap = normalizeEnum(LineCap, o.line_cap, LineCap.Straight)
    return s
  }
}

// Marker (highlighter) defaults: constant pressure, wider stroke on a lower layer.
export class MarkerOptions extends SmoothOptions {
  static default(): MarkerOptions {
    const o = new MarkerOptions()
    o.pressure_curve = PressureCurve.Const
    o.stroke_width = 12.0
    return o
  }
}

export enum TexturedDotsDistribution {
  Uniform = 'uniform',
  Normal = 'normal',
  Exponential = 'exponential',
  ReverseExponential = 'reverse_exponential'
}

export class TexturedOptions {
  seed: number | null = null
  stroke_width = 6.0
  stroke_color: Color | null = Color.BLACK
  density = 5.0
  distribution: TexturedDotsDistribution = TexturedDotsDistribution.Normal
  pressure_curve = PressureCurve.Linear
  // shape of the texture stamp
  shape: TexturedShape = TexturedShape.Dots

  static DENSITY_MIN = 0.1
  static DENSITY_MAX = 100.0
  static STROKE_WIDTH_MIN = 0.1
  static STROKE_WIDTH_MAX = 500.0
  static DOTS_RADII_DEFAULT = { x: 1.2, y: 0.3 }
  static STROKE_WIDTH_RADII_WEIGHT = 0.1

  clone(): TexturedOptions {
    const o = new TexturedOptions()
    Object.assign(o, this)
    o.stroke_color = this.stroke_color ? this.stroke_color.clone() : null
    return o
  }

  // Deterministic RNG for a given stroke (stable across re-renders).
  rng(): () => number {
    return mulberry32(this.seed ?? Math.floor(Math.random() * 2 ** 31))
  }

  toJSON() {
    return {
      seed: this.seed,
      stroke_width: this.stroke_width,
      stroke_color: this.stroke_color ? this.stroke_color.toJSON() : null,
      density: this.density,
      distribution: this.distribution,
      pressure_curve: this.pressure_curve,
      shape: this.shape
    }
  }

  static fromJSON(o: any): TexturedOptions {
    const t = new TexturedOptions()
    if (!o) return t
    t.seed = o.seed ?? null
    t.stroke_width = num(o.stroke_width, 6.0)
    t.stroke_color = o.stroke_color ? Color.fromJSON(o.stroke_color) : null
    t.density = num(o.density, 5.0)
    // desktop serde emits PascalCase ("Uniform"/"Normal"/"Exponential"/
    // "ReverseExponential"); our enum is lowercase — normalize defensively.
    t.distribution =
      normalizeEnum(TexturedDotsDistribution, o.distribution, TexturedDotsDistribution.Normal)
    t.pressure_curve = normalizeEnum(PressureCurve, o.pressure_curve, PressureCurve.Linear)
    t.shape = normalizeEnum(TexturedShape, o.shape, TexturedShape.Dots)
    return t
  }
}

export enum TexturedShape {
  Dots = 'dots',
  Lines = 'lines',
  Grid = 'grid'
}

export enum FillStyle {
  None = 'none',
  Solid = 'solid',
  Hachure = 'hachure',
  ZigZag = 'zig_zag',
  ZigZagLine = 'zig_zag_line',
  Crosshatch = 'crosshatch',
  Dots = 'dots',
  Dashed = 'dashed'
}

// Normalize a desktop rough FillStyle token. Desktop serde uses lowercase
// tokens (solid/hachure/zig_zag/...); pre-0.5.9 wrote the capitalized alias
// "Hachure" which actually rendered a solid fill. Unsupported patterns fall
// back to hachure (the closest pattern the canvas renderer implements).
export function normalizeFillStyle(v: any): FillStyle {
  if (v === null || v === undefined) return FillStyle.Hachure
  if (v === 'Hachure') return FillStyle.Solid // legacy alias
  const s = String(v).toLowerCase()
  if (s === 'solid' || s === 'none') return s === 'none' ? FillStyle.None : FillStyle.Solid
  if (Object.values(FillStyle).includes(s as FillStyle)) return s as FillStyle
  return FillStyle.Hachure
}

export class RoughOptions {
  stroke_color: Color | null = Color.BLACK
  fill_color: Color | null = null
  fill_style: FillStyle = FillStyle.Hachure
  hachure_angle = -0.715585 // -41 degrees
  stroke_width = 2.0
  roughness = 1.0
  bowing = 1.0
  stroke_count = 2 // rough.js: two passes
  seed: number | null = null
  line_cap = LineCap.Straight
  line_style = LineStyle.Solid

  static ROUGH_BOUNDS_MARGIN = 20.0

  clone(): RoughOptions {
    const o = new RoughOptions()
    Object.assign(o, this)
    o.stroke_color = this.stroke_color ? this.stroke_color.clone() : null
    o.fill_color = this.fill_color ? this.fill_color.clone() : null
    return o
  }

  rng(): () => number {
    return mulberry32(this.seed ?? Math.floor(Math.random() * 2 ** 31))
  }

  toJSON() {
    return {
      stroke_color: this.stroke_color ? this.stroke_color.toJSON() : null,
      fill_color: this.fill_color ? this.fill_color.toJSON() : null,
      fill_style: this.fill_style,
      hachure_angle: this.hachure_angle,
      stroke_width: this.stroke_width,
      roughness: this.roughness,
      bowing: this.bowing,
      stroke_count: this.stroke_count,
      seed: this.seed,
      line_cap: this.line_cap,
      line_style: this.line_style
    }
  }

  static fromJSON(o: any): RoughOptions {
    const r = new RoughOptions()
    if (!o) return r
    r.stroke_color = o.stroke_color !== undefined ? (o.stroke_color ? Color.fromJSON(o.stroke_color) : null) : Color.BLACK
    r.fill_color = o.fill_color ? Color.fromJSON(o.fill_color) : null
    r.fill_style = normalizeFillStyle(o.fill_style)
    const rawAngle = num(o.hachure_angle, -0.715585)
    // Older desktop files serialized -41 degrees; current Rnote uses radians.
    r.hachure_angle = Math.abs(rawAngle) > Math.PI * 2 ? (rawAngle * Math.PI) / 180 : rawAngle
    r.stroke_width = num(o.stroke_width, 2.0)
    r.roughness = num(o.roughness, 1.0)
    r.bowing = num(o.bowing, 1.0)
    r.stroke_count = num(o.stroke_count, 2)
    r.seed = o.seed ?? null
    r.line_cap = normalizeEnum(LineCap, o.line_cap, LineCap.Straight)
    r.line_style = normalizeEnum(LineStyle, o.line_style, LineStyle.Solid)
    return r
  }
}

// A style is either smooth or rough (rnote compose::Style).
export type Style =
  | { kind: 'smooth'; options: SmoothOptions }
  | { kind: 'rough'; options: RoughOptions }

function num(v: any, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}

// Match a desktop serde enum token (lowercase, or PascalCase on older
// versions) to one of our string enums; fall back to a default.
function normalizeEnum<T extends string>(enumObj: Record<string, T>, v: any, fallback: T): T {
  if (v === null || v === undefined) return fallback
  const direct = String(v) as T
  if (Object.values(enumObj).includes(direct)) return direct
  const lower = String(v).toLowerCase() as T
  if (Object.values(enumObj).includes(lower)) return lower
  return fallback
}
