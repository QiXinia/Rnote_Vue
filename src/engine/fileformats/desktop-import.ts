// Best-effort, structurally-faithful mapping of a *desktop* Rnote 0.15
// engine_snapshot (Rust serde JSON) into the rnote-vue snapshot model.
// Covers brush / shape / text / bitmap strokes, document format/background/
// layout and camera; vector images and composite builders degrade gracefully.

import { Vec2, Aabb } from '../../compose/geometry'
import { Color } from '../../compose/style/color'
import {
  SmoothOptions,
  TexturedOptions,
  RoughOptions,
  StrokeLayer,
  strokeLayerRank
} from '../../compose/style/options'
import { PenPath, Element, Segment } from '../../compose/penpath/penpath'
import { BrushStyleKind } from '../pens/pensconfig'
import { BrushStroke } from '../strokes/brushstroke'
import { ShapeStroke } from '../strokes/shapestroke'
import { TextStroke, TextStyle, TextAlignment } from '../strokes/textstroke'
import { BitmapImageStroke, VectorImageStroke } from '../strokes/imagestroke'
import {
  LineShape,
  ArrowShape,
  ArrowHeadStyle,
  RectangleShape,
  EllipseShape,
  PolygonShape,
  QuadBezShape,
  CubBezShape
} from '../../compose/shapes/shape'
import { Layout } from '../document/layout'
import type { EngineSnapshot } from '../engine'

// ---------- low level helpers ----------

function parseColor(o: any, fallback = new Color(0, 0, 0, 1)): Color {
  if (!o) return fallback
  try {
    if (Array.isArray(o) && o.length >= 3) return new Color(o[0], o[1], o[2], o[3] ?? 1)
    if (typeof o === 'object') {
      if (typeof o.r === 'number') return new Color(o.r, o.g ?? 0, o.b ?? 0, o.a ?? 1)
      if (Array.isArray(o[0])) return parseColor(o[0])
    }
    if (typeof o === 'string') return Color.fromCss(o)
  } catch {
    /* ignore */
  }
  return fallback
}

// glam DAffine2 columns: [xAxis.x,xAxis.y, yAxis.x,yAxis.y, trans.x,trans.y]
interface Affine {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}
function parseAffine(o: any): Affine {
  const identity: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  if (!o) return identity
  // wrapper forms: `{ affine: [...] }` (Transformable) or `{ transform: {...} }`
  if (!Array.isArray(o) && typeof o === 'object') {
    if (Array.isArray(o.affine)) return parseAffine(o.affine)
    if (o.transform) return parseAffine(o.transform)
    // glam decomposed form: { matrix:{...} } or axis/translation vectors
    const m = o.matrix
    if (m) return parseAffine(m)
    const xa = o.x_axis ?? o.xAxis
    const ya = o.y_axis ?? o.yAxis
    const tr = o.translation ?? o.trans
    if (xa && ya && tr) {
      const x = Array.isArray(xa) ? xa : [xa.x, xa.y]
      const y = Array.isArray(ya) ? ya : [ya.x, ya.y]
      const t = Array.isArray(tr) ? tr : [tr.x, tr.y]
      return { a: x[0], b: x[1], c: y[0], d: y[1], e: t[0], f: t[1] }
    }
    return identity
  }
  if (Array.isArray(o) && o.length === 6) {
    return { a: o[0], b: o[1], c: o[2], d: o[3], e: o[4], f: o[5] }
  }
  // 3x3 column-major glam matrix (last row 0,0,1)
  if (Array.isArray(o) && o.length === 9) {
    return { a: o[0], b: o[1], c: o[3], d: o[4], e: o[6], f: o[7] }
  }
  return identity
}

// Resolve the affine carried by a desktop rectangle/cuboid transform, which
// may live under `affine` (6-array) or `transform.affine` (3x3 wrapper).
function rectAffine(rect: any): Affine {
  if (!rect) return parseAffine(null)
  if (rect.affine) return parseAffine(rect.affine)
  if (rect.transform) return parseAffine(rect.transform)
  return parseAffine(null)
}
function applyAffine(t: Affine, p: Vec2): Vec2 {
  return new Vec2(t.a * p.x + t.c * p.y + t.e, t.b * p.x + t.d * p.y + t.f)
}
function affineRotation(t: Affine): number {
  return Math.atan2(t.b, t.a)
}

function v2(o: any): Vec2 {
  if (!o) return new Vec2()
  if (Array.isArray(o)) return new Vec2(o[0], o[1])
  return new Vec2(o.x ?? 0, o.y ?? 0)
}

// p2d Cuboid serde: half extents (centred at origin) as [hx,hy] or {half_extents}
function cuboidAabb(o: any, affine?: Affine): Aabb {
  let hx = 0
  let hy = 0
  if (Array.isArray(o)) {
    hx = o[0]
    hy = o[1]
  } else if (o) {
    const he = o.half_extents ?? o.halfExtents
    if (Array.isArray(he)) {
      hx = he[0]
      hy = he[1]
    } else if (he) {
      hx = he.x ?? 0
      hy = he.y ?? 0
    }
  }
  const corners = [new Vec2(-hx, -hy), new Vec2(hx, -hy), new Vec2(hx, hy), new Vec2(-hx, hy)]
  const t = affine ?? parseAffine(o?.affine)
  const pts = corners.map((c) => applyAffine(t, c))
  return Aabb.fromPoints(pts)
}

function cubicPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t
  const x = u ** 3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * p3.x
  const y = u ** 3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * p3.y
  return new Vec2(x, y)
}
function quadPoint(p0: Vec2, p1: Vec2, p2: Vec2, t: number): Vec2 {
  const u = 1 - t
  return new Vec2(u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y)
}

function elem(o: any): Element {
  return new Element(v2(o.pos ?? o), typeof o.pressure === 'number' ? o.pressure : 0.5)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// Legacy (pre-0.5.13) pen path: the path is a flat array of segments
// (`dot` / `line` / `cubbez`; curve control points are bare [x,y] vectors
// rather than Elements). Flatten it into dense Elements.
function flattenLegacyPath(path: any[]): Element[] {
  const out: Element[] = []
  let prev: Vec2 | null = null
  for (const seg of path) {
    if (!seg || typeof seg !== 'object') continue
    if (seg.dot) {
      const e = seg.dot.element ?? seg.dot
      out.push(elem(e))
      prev = v2(e.pos ?? e)
    } else if (seg.line) {
      const s = seg.line
      if (prev === null && s.start) out.push(elem(s.start))
      const endE = elem(s.end)
      out.push(endE)
      prev = endE.pos
    } else if (seg.cubbez) {
      const s = seg.cubbez
      const start = prev ?? v2(s.start?.pos ?? s.start)
      if (prev === null && s.start) out.push(elem(s.start))
      const cp1 = v2(s.cp1)
      const cp2 = v2(s.cp2)
      const endE = elem(s.end)
      const end = v2(s.end.pos ?? s.end)
      const startPressure = out.length ? out[out.length - 1].pressure : (s.start ? elem(s.start).pressure : endE.pressure)
      const N = 8
      for (let i = 1; i <= N; i++) {
        out.push(new Element(cubicPoint(start, cp1, cp2, end, i / N), lerp(startPressure, endE.pressure, i / N)))
      }
      out[out.length - 1] = endE
      prev = end
    } else if (seg.quadbez) {
      const s = seg.quadbez
      const start = prev ?? v2(s.start?.pos ?? s.start)
      if (prev === null && s.start) out.push(elem(s.start))
      const cp = v2(s.cp)
      const endE = elem(s.end)
      const end = v2(s.end.pos ?? s.end)
      const startPressure = out.length ? out[out.length - 1].pressure : (s.start ? elem(s.start).pressure : endE.pressure)
      const N = 6
      for (let i = 1; i <= N; i++) {
        out.push(new Element(quadPoint(start, cp, end, i / N), lerp(startPressure, endE.pressure, i / N)))
      }
      out[out.length - 1] = endE
      prev = end
    }
  }
  return out
}

// Flatten a desktop pen_path into dense Elements.
function flattenPenPath(path: any): Element[] {
  if (!path) return []
  // Legacy schema: path is itself the segment array.
  if (Array.isArray(path)) return flattenLegacyPath(path)
  const out: Element[] = [elem(path.start)]
  let prev = v2(path.start.pos ?? path.start)
  const segs = path.segments ?? []
  for (const seg of segs) {
    if (seg.lineto || seg.line) {
      const end = seg.lineto?.end ?? seg.line?.end
      out.push(elem(end))
      prev = v2(end.pos ?? end)
    } else if (seg.quadbezto || seg.quadbez) {
      const s = seg.quadbezto ?? seg.quadbez
      const cp = v2(s.cp.pos ?? s.cp)
      const endE = elem(s.end)
      const end = v2(s.end.pos ?? s.end)
      const startPressure = out.length ? out[out.length - 1].pressure : endE.pressure
      const N = 6
      for (let i = 1; i <= N; i++) {
        out.push(new Element(quadPoint(prev, cp, end, i / N), lerp(startPressure, endE.pressure, i / N)))
      }
      out[out.length - 1] = endE
      prev = end
    } else if (seg.cubbezto || seg.cubbez) {
      const s = seg.cubbezto ?? seg.cubbez
      const cp1 = v2(s.cp1.pos ?? s.cp1)
      const cp2 = v2(s.cp2.pos ?? s.cp2)
      const endE = elem(s.end)
      const end = v2(s.end.pos ?? s.end)
      const startPressure = out.length ? out[out.length - 1].pressure : endE.pressure
      const N = 8
      for (let i = 1; i <= N; i++) {
        out.push(new Element(cubicPoint(prev, cp1, cp2, end, i / N), lerp(startPressure, endE.pressure, i / N)))
      }
      out[out.length - 1] = endE
      prev = end
    }
  }
  return out
}

// Convert a desktop pen path into a PenPath. Modern files (a `start` plus a
// `segments` array of lineto/cubbezto) keep their native bezier segments
// verbatim (lossless, resolution independent); legacy schemas are flattened
// into dense elements and re-fitted by the BrushStroke constructor.
function parsePenPath(path: any): PenPath {
  if (path && path.start && Array.isArray(path.segments)) {
    const start = elem(path.start)
    const segs: Segment[] = path.segments
      .map((s: any) => Segment.fromJSON(s))
      .filter((s: Segment | null): s is Segment => s !== null)
    return PenPath.fromNative(start, segs)
  }
  return new PenPath(flattenPenPath(path))
}

// ---------- chrono layers ----------

function unwrapVersioned<T = any>(entry: any): T | null {
  if (!entry) return null
  if (typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'value')) {
    return entry.value as T
  }
  return entry as T
}

function parseDesktopLayer(layer: any): StrokeLayer {
  if (!layer) return StrokeLayer.UserLayer
  if (typeof layer === 'string') {
    const s = layer.toLowerCase()
    if (s === 'document') return StrokeLayer.Document
    if (s === 'image') return StrokeLayer.Image
    if (s === 'highlighter') return StrokeLayer.Highlighter
    if (s.includes('user')) return StrokeLayer.UserLayer
  }
  if (typeof layer === 'object') {
    const keys = Object.keys(layer)
    if (keys.includes('document')) return StrokeLayer.Document
    if (keys.includes('image')) return StrokeLayer.Image
    if (keys.includes('highlighter')) return StrokeLayer.Highlighter
    if (keys.some((k) => k.toLowerCase().includes('user'))) return StrokeLayer.UserLayer
  }
  return StrokeLayer.UserLayer
}

interface ChronoInfo {
  t: number
  layer: StrokeLayer
  explicit: boolean
}

function chronoFor(components: any[], index: number): ChronoInfo {
  const value = unwrapVersioned(components[index])
  if (value && typeof value === 'object' && typeof value.t === 'number') {
    return {
      t: value.t,
      layer: parseDesktopLayer(value.layer),
      explicit: value.layer !== undefined && value.layer !== null
    }
  }
  return { t: index, layer: StrokeLayer.UserLayer, explicit: false }
}

// ---------- stroke mappers ----------

function mapBrushStroke(o: any, chrono?: ChronoInfo): BrushStroke | null {
  try {
    const path = parsePenPath(o.path)
    if (path.elements.length < 1) return null
    const style = o.style ?? {}
    if (style.textured) {
      const textured = TexturedOptions.fromJSON(style.textured)
      const smooth = new SmoothOptions()
      const stroke = new BrushStroke(path, BrushStyleKind.Textured, smooth, textured)
      if (chrono?.explicit) stroke.layer = chrono.layer
      return stroke
    }
    const smoothSrc = style.smooth ?? style.rough ?? {}
    const smooth = SmoothOptions.fromJSON(smoothSrc)
    // Desktop marker strokes are ordinary constant-pressure SmoothOptions.
    // Their authoritative identity is the Highlighter chrono layer; alpha is
    // not a reliable marker signal and can be 1.0 in real files.
    const heuristicMarker =
      !chrono?.explicit &&
      smoothSrc.pressure_curve === 'const' &&
      smooth.stroke_width >= 6 &&
      (smooth.stroke_color?.a ?? 1) < 0.6
    const isMarker = chrono?.layer === StrokeLayer.Highlighter || heuristicMarker
    const stroke = new BrushStroke(
      path,
      isMarker ? BrushStyleKind.Marker : BrushStyleKind.Solid,
      smooth,
      new TexturedOptions()
    )
    if (chrono?.explicit) stroke.layer = chrono.layer
    return stroke
  } catch (e) {
    console.warn('desktop brushstroke map failed', e)
    return null
  }
}

function mapShapeStroke(o: any, chrono?: ChronoInfo): ShapeStroke | null {
  try {
    const shapeObj = o.shape
    if (!shapeObj) return null
    const tag = Object.keys(shapeObj)[0]
    const data = shapeObj[tag]
    let shape: import('../../compose/shapes/shape').Shape | null = null
    switch (tag) {
      case 'line':
        shape = new LineShape(v2(data.start), v2(data.end))
        break
      case 'arrow': {
        // desktop Arrow stores `tip` (not `end`) and draws an open chevron head
        const arrow = new ArrowShape(v2(data.start), v2(data.tip ?? data.end))
        arrow.head = ArrowHeadStyle.Open
        shape = arrow
        break
      }
      case 'rect': {
        const t = parseAffine(data.affine ?? data.transform)
        shape = new RectangleShape(cuboidAabb(data.cuboid, t))
        break
      }
      case 'ellipse': {
        // local radii are centred at the origin; the affine maps them to world
        // (translation = centre, axes carry rotation and any non-uniform scale)
        const t = parseAffine(data.affine ?? data.transform)
        const local = v2(data.radii)
        const scaleX = Math.hypot(t.a, t.b)
        const scaleY = Math.hypot(t.c, t.d)
        shape = new EllipseShape(
          new Vec2(t.e, t.f),
          new Vec2(local.x * scaleX, local.y * scaleY),
          affineRotation(t)
        )
        break
      }
      case 'quadbez':
        shape = new QuadBezShape(v2(data.start), v2(data.cp?.pos ?? data.cp), v2(data.end))
        break
      case 'cubbez':
        shape = new CubBezShape(
          v2(data.start),
          v2(data.cp1?.pos ?? data.cp1),
          v2(data.cp2?.pos ?? data.cp2),
          v2(data.end)
        )
        break
      case 'polyline':
      case 'polygon': {
        // desktop Polygon/Polyline: { start: Vector2, path: Vec<Vector2> }
        // (bare vectors, not pen-path segment objects)
        const pts = [v2(data.start), ...((data.path as any[]) ?? []).map((p) => v2(p?.pos ?? p))]
        shape = new PolygonShape(pts, tag === 'polygon')
        break
      }
      default:
        return null
    }
    if (!shape) return null
    const style = o.style ?? {}
    let roughEnabled = false
    let smooth: SmoothOptions
    let rough: RoughOptions
    if (style.rough) {
      roughEnabled = true
      rough = RoughOptions.fromJSON(style.rough)
      // mirror colour/width onto the smooth options used for bounds/highlight
      smooth = SmoothOptions.fromJSON({
        stroke_width: style.rough.stroke_width,
        stroke_color: style.rough.stroke_color,
        fill_color: style.rough.fill_color
      })
    } else if (style.textured) {
      // only a Line supports a textured style on desktop; render it smooth
      const tx = style.textured
      smooth = SmoothOptions.fromJSON({
        stroke_width: tx.stroke_width,
        stroke_color: tx.stroke_color,
        line_cap: 'rounded'
      })
      rough = new RoughOptions()
    } else {
      smooth = SmoothOptions.fromJSON(style.smooth ?? {})
      rough = RoughOptions.fromJSON({})
    }
    const stroke = new ShapeStroke([shape], { smooth, rough, roughEnabled })
    if (chrono?.explicit) stroke.layer = chrono.layer
    return stroke
  } catch (e) {
    console.warn('desktop shapestroke map failed', e)
    return null
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

function mapAlignment(a: any): TextAlignment {
  switch (String(a ?? 'start').toLowerCase()) {
    case 'center':
    case 'middle':
      return TextAlignment.Center
    case 'end':
    case 'right':
      return TextAlignment.End
    case 'fill':
    case 'justify':
      return TextAlignment.Fill
    default:
      return TextAlignment.Start
  }
}

function mapTextStroke(o: any): TextStroke | null {
  try {
    const text: string = o.text ?? ''
    if (!text.trim()) return null
    const t = parseAffine(o.affine ?? o.transform)
    const ts = o.text_style ?? {}
    const style = new TextStyle()
    style.family = mapFontFamily(ts.font_family)
    style.size = ts.font_size ?? 32
    style.weight = ts.font_weight ?? 500
    // desktop stores the colour at text_style.color
    style.color = parseColor(ts.color ?? ts.text_color)
    style.alignment = mapAlignment(ts.alignment)

    // base font style plus per-range attributes (ranged_text_attributes)
    let italic = ts.font_style === 'italic'
    let bold = ts.font_style === 'bold' || (ts.font_weight ?? 500) >= 700
    let underline = false
    let strike = false
    for (const attr of ts.ranged_text_attributes ?? []) {
      const a = attr?.attribute ?? {}
      const fs = a.font_style
      if (fs === 'italic') italic = true
      else if (fs === 'regular') italic = false
      else if (fs === 'bold') bold = true
      if (a.underline) underline = true
      if (a.strikethrough || a.line_through) strike = true
      if (a.font_weight) style.weight = a.font_weight
    }
    style.italic = italic
    style.weight = bold ? Math.max(style.weight, 700) : style.weight
    style.underline = underline
    style.strike = strike

    const width = ts.max_width ?? Math.max(200, text.length * (ts.font_size ?? 32) * 0.6)
    const stroke = new TextStroke(escapeHtml(text), new Vec2(t.e, t.f), width, style)
    return stroke
  } catch (e) {
    console.warn('desktop textstroke map failed', e)
    return null
  }
}

function mapFontFamily(f: any): string {
  if (!f) return 'serif'
  if (typeof f === 'string') {
    const s = f.trim()
    if (/^(serif|sans-serif|sans|monospace|mono|cursive|fantasy|system-ui)$/i.test(s)) {
      if (/^sans$/i.test(s)) return 'sans-serif'
      if (/^mono$/i.test(s)) return 'monospace'
      return s.toLowerCase()
    }
    return s // concrete family name; quoted/fallback applied at render
  }
  // enum-like object, e.g. { "mono": null } or { family: "..." }
  if (typeof f === 'object') {
    if (typeof f.family === 'string') return mapFontFamily(f.family)
    const s = JSON.stringify(f).toLowerCase()
    if (s.includes('mono')) return 'monospace'
    if (s.includes('sans')) return 'sans-serif'
    if (s.includes('cursive') || s.includes('hand')) return 'cursive'
  }
  return 'serif'
}

// Desktop labels raster payloads as R8g8b8a8Premultiplied, but its encoded-
// image import path (`Image::try_from_encoded_bytes` -> `DynamicImage::into_rgba8`)
// actually writes straight RGBA. Cairo-rendered images are premultiplied. Detect
// straight data by channels that cannot be valid once premultiplied (channel > a).
function rawRgbaLooksStraight(bytes: Uint8Array, length: number): boolean {
  for (let i = 0; i < length; i += 4) {
    const a = bytes[i + 3]
    if (a > 0 && a < 255 && (bytes[i] > a || bytes[i + 1] > a || bytes[i + 2] > a)) return true
  }
  return false
}

function rawRgbaToDataUrl(b64: string, w: number, h: number, premultiplied: boolean): string | null {
  try {
    const bin = atob(b64.replace(/\s/g, ''))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const expected = w * h * 4
    // encoded image? PNG magic 89 50 4e 47, JPEG ff d8 ff
    const isEncoded =
      (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) ||
      (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    if (isEncoded) {
      let binStr = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) binStr += String.fromCharCode(...bytes.subarray(i, i + chunk))
      return `data:${bytes[0] === 0xff ? 'image/jpeg' : 'image/png'};base64,${btoa(binStr)}`
    }
    if (bytes.length < expected || w <= 0 || h <= 0) return null
    const img = new ImageData(w, h)
    const d = img.data
    for (let i = 0; i < expected; i += 4) {
      const r = bytes[i]
      const g = bytes[i + 1]
      const b = bytes[i + 2]
      const a = bytes[i + 3]
      if (premultiplied && a > 0 && a < 255) {
        d[i] = Math.min(255, Math.round((r * 255) / a))
        d[i + 1] = Math.min(255, Math.round((g * 255) / a))
        d[i + 2] = Math.min(255, Math.round((b * 255) / a))
      } else {
        d[i] = r
        d[i + 1] = g
        d[i + 2] = b
      }
      d[i + 3] = a
    }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.putImageData(img, 0, 0)
    return canvas.toDataURL('image/png')
  } catch (e) {
    console.warn('desktop bitmap decode failed', e)
    return null
  }
}

function mapBitmap(o: any, chrono?: ChronoInfo): BitmapImageStroke | null {
  try {
    const img = o.image
    const b64: string | undefined = img?.data
    if (!b64) return null
    const rect = o.rectangle ?? img?.rectangle
    const t = rectAffine(rect)
    const aabb = cuboidAabb(rect?.cuboid, t)
    const pw = img?.pixel_width ?? Math.round(aabb.width())
    const ph = img?.pixel_height ?? Math.round(aabb.height())
    const declaredPremultiplied = String(img?.memory_format ?? '').toLowerCase().includes('premultiplied')
    let premultiplied = declaredPremultiplied
    try {
      const bin = atob(b64.replace(/\s/g, ''))
      const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
      if (rawRgbaLooksStraight(bytes, pw * ph * 4)) premultiplied = false
    } catch {
      // rawRgbaToDataUrl reports the actual decode failure below
    }
    const dataUrl = rawRgbaToDataUrl(b64, pw, ph, premultiplied) ?? `data:image/png;base64,${b64}`
    const stroke = new BitmapImageStroke(dataUrl, aabb, pw, ph)
    stroke.layer = chrono?.explicit ? chrono.layer : StrokeLayer.Image
    return stroke
  } catch (e) {
    console.warn('desktop bitmap map failed', e)
    return null
  }
}

function mapVector(o: any, chrono?: ChronoInfo): VectorImageStroke | null {
  try {
    let svg: string | undefined = o.svg_data ?? o.svg?.svg_data ?? o.svg
    if (!svg || typeof svg !== 'string') return null
    // desktop sometimes stores just the inner markup; ensure a root <svg>
    if (!svg.includes('<svg')) {
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">${svg}</svg>`
    }
    const rect = o.rectangle ?? o.rect
    const t = rectAffine(rect)
    const aabb = cuboidAabb(rect?.cuboid, t)
    const stroke = new VectorImageStroke(svg, aabb)
    stroke.layer = chrono?.explicit ? chrono.layer : StrokeLayer.Image
    return stroke
  } catch (e) {
    console.warn('desktop vectorimage map failed', e)
    return null
  }
}

// ---------- document ----------

function mapLayout(l: any): Layout {
  if (!l) return Layout.Infinite
  const s = String(l).replace(/_/g, '-')
  if (s.includes('fixed')) return Layout.FixedSize
  if (s.includes('semi')) return Layout.SemiInfinite
  if (s.includes('continuous')) return Layout.ContinuousVertical
  return Layout.Infinite
}

function mapPatternSize(o: any): { x: number; y: number } {
  if (Array.isArray(o) && o.length >= 2) return { x: o[0], y: o[1] }
  if (o && typeof o === 'object') return { x: o.x ?? 32, y: o.y ?? 32 }
  return { x: 32, y: 32 }
}

function mapDocument(doc: any): any {
  const out: any = {}
  // desktop nests format/background/layout under document.config
  const cfg = doc?.config ?? doc
  const f = cfg?.format
  if (f) {
    out.format = {
      width: f.width ?? 1123,
      height: f.height ?? 1587,
      dpi: f.dpi ?? 96,
      orientation: f.orientation ?? 'portrait',
      predefined: f.predefined ?? (f.width > 1000 ? 'a3' : 'a4'),
      border_color: f.border_color ? parseColor(f.border_color).toJSON() : undefined,
      show_border: f.show_borders ?? f.show_border ?? true
    }
  }
  const b = cfg?.background
  if (b) {
    out.background = {
      color: parseColor(b.color, new Color(1, 1, 1, 1)).toJSON(),
      pattern: b.pattern ?? 'dots',
      pattern_size: mapPatternSize(b.pattern_size),
      pattern_color: parseColor(b.pattern_color, new Color(0.8, 0.9, 1, 1)).toJSON()
    }
  }
  out.layout = mapLayout(cfg?.layout ?? doc?.layout)
  out.pages = cfg?.pages ?? doc?.pages ?? 1
  return out
}

// Desktop and web cameras now share the same model: offset is the viewport
// top-left in surface (zoomed) coords, so it is copied verbatim.
function mapCamera(c: any): { offset: { x: number; y: number }; zoom: number } {
  const z = typeof c.zoom === 'number' && c.zoom > 0 ? c.zoom : 1
  const raw = Array.isArray(c.offset)
    ? { x: c.offset[0], y: c.offset[1] }
    : c.offset
      ? { x: c.offset.x, y: c.offset.y }
      : { x: -96, y: -96 }
  return { offset: { x: raw.x, y: raw.y }, zoom: z }
}

// ---------- entry point ----------

export function mapDesktopSnapshot(snap: any): EngineSnapshot {
  const components: any[] =
    snap.store?.stroke_components ??
    snap.store_snapshot?.stroke_components ??
    snap.stroke_components ??
    []
  const chronoComponents: any[] =
    snap.store?.chrono_components ??
    snap.store_snapshot?.chrono_components ??
    snap.chrono_components ??
    []

  // The desktop and web documents share the same origin: page bounds start at
  // (0, 0) and strokes use document coords verbatim, so no origin shift is
  // applied on import.
  const docObj = snap.document ?? snap.sheet
  const mappedDoc = docObj ? mapDocument(docObj) : undefined

  const entries: { index: number; t: number; layer: StrokeLayer; stroke: any }[] = []
  components.forEach((comp, index) => {
    const value = unwrapVersioned(comp)
    if (!value || typeof value !== 'object') return
    const chrono = chronoFor(chronoComponents, index)
    let stroke: { layer: StrokeLayer; toJSON: () => any } | null = null
    if (value.brushstroke) {
      stroke = mapBrushStroke(value.brushstroke, chrono)
    } else if (value.shapestroke) {
      stroke = mapShapeStroke(value.shapestroke, chrono)
    } else if (value.textstroke) {
      stroke = mapTextStroke(value.textstroke)
      if (stroke && chrono.explicit) stroke.layer = chrono.layer
    } else if (value.bitmapimage) {
      stroke = mapBitmap(value.bitmapimage, chrono)
    } else if (value.vectorimage) {
      stroke = mapVector(value.vectorimage, chrono)
    }
    if (stroke) {
      entries.push({ index, t: chrono.t, layer: stroke.layer, stroke })
    }
  })
  // Rust chrono_comp orders by layer rank first (Document, Image, Highlighter,
  // UserLayer), then time inside each layer.
  entries.sort((a, b) => {
    const lr = strokeLayerRank(a.layer) - strokeLayerRank(b.layer)
    if (lr !== 0) return lr
    if (a.t !== b.t) return a.t - b.t
    return a.index - b.index
  })
  const strokes = entries.map((e) => e.stroke.toJSON())

  const mapped: EngineSnapshot = {
    version: { major: 0, minor: 15, patch: 0 },
    document: mappedDoc,
    camera: snap.camera ? mapCamera(snap.camera) : undefined,
    pens_config: undefined,
    store: { strokes, selected: [], groups: {} },
    settings: {}
  }
  return mapped
}

// Chunked variant for opening large files: yields to the event loop every 64
// components so the UI stays responsive (and can show progress) instead of
// blocking on hundreds of stroke mappings; reports progress via onProgress.
export async function mapDesktopSnapshotAsync(
  snap: any,
  onProgress?: (done: number, total: number) => void
): Promise<EngineSnapshot> {
  const components: any[] =
    snap.store?.stroke_components ??
    snap.store_snapshot?.stroke_components ??
    snap.stroke_components ??
    []
  const chronoComponents: any[] =
    snap.store?.chrono_components ??
    snap.store_snapshot?.chrono_components ??
    snap.chrono_components ??
    []

  const docObj = snap.document ?? snap.sheet
  const mappedDoc = docObj ? mapDocument(docObj) : undefined

  const entries: { index: number; t: number; layer: StrokeLayer; json: any }[] = []
  for (let index = 0; index < components.length; index++) {
    const value = unwrapVersioned(components[index])
    if (value && typeof value === 'object') {
      const chrono = chronoFor(chronoComponents, index)
      let stroke: { layer: StrokeLayer; toJSON: () => any; translate: (v: Vec2) => void } | null = null
      if (value.brushstroke) stroke = mapBrushStroke(value.brushstroke, chrono)
      else if (value.shapestroke) stroke = mapShapeStroke(value.shapestroke, chrono)
      else if (value.textstroke) {
        stroke = mapTextStroke(value.textstroke)
        if (stroke && chrono.explicit) stroke.layer = chrono.layer
      } else if (value.bitmapimage) stroke = mapBitmap(value.bitmapimage, chrono)
      else if (value.vectorimage) stroke = mapVector(value.vectorimage, chrono)
      if (stroke) {
        entries.push({ index, t: chrono.t, layer: stroke.layer, json: stroke.toJSON() })
      }
    }
    if ((index & 63) === 63) {
      onProgress?.(index + 1, components.length)
      // yield to the event loop so the UI can paint / stay responsive
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  onProgress?.(components.length, components.length)
  entries.sort((a, b) => {
    const lr = strokeLayerRank(a.layer) - strokeLayerRank(b.layer)
    if (lr !== 0) return lr
    if (a.t !== b.t) return a.t - b.t
    return a.index - b.index
  })

  const mapped: EngineSnapshot = {
    version: { major: 0, minor: 15, patch: 0 },
    document: mappedDoc,
    camera: snap.camera ? mapCamera(snap.camera) : undefined,
    pens_config: undefined,
    store: { strokes: entries.map((e) => e.json), selected: [], groups: {} },
    settings: {}
  }
  return mapped
}
