// Serialize the rnote-vue EngineSnapshot into the *native desktop Rnote 0.15*
// engine_snapshot schema (the exact serde JSON produced by the Rust crates):
//   gzip({ version: "0.15.0", data: { engine_snapshot: {
//     document, camera, stroke_components, chrono_components, chrono_counter
//   }}})
//
// The inverse mapping lives in desktop-import.ts. Web-only extensions that have
// no desktop representation degrade to the closest native form:
//   - multi-shape strokes (grid / coordinate-system builders) flatten into
//     several shapestroke components;
//   - triangle arrowheads become the native open chevron arrow;
//   - textured stamp shapes (lines/grid) are dropped (desktop has no shape
//     field on TexturedOptions);
//   - rounded rectangle corners are dropped (the native Rectangle is sharp).

import type { EngineSnapshot } from '../engine'
import { StrokeLayer } from '../../compose/style/options'

const DP3 = 1000
// slotmap (and SecondaryMap) serialize as a dense slot array whose index 0 is
// always an *empty sentinel* slot. The Rust deserializer hard-errors with
// "first slot not empty" if the first element is occupied, so every writer
// must prepend this tombstone.
const SLOT_SENTINEL = { value: null, version: 0 }
function r3(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.round(v * DP3) / DP3
}
function vec2(x: number, y: number): [number, number] {
  return [r3(x), r3(y)]
}
function color(o: any): { r: number; g: number; b: number; a: number } | null {
  if (!o) return null
  return { r: r3(o.r ?? 0), g: r3(o.g ?? 0), b: r3(o.b ?? 0), a: r3(o.a ?? 1) }
}
function pt(o: any): [number, number] {
  return vec2(o?.x ?? 0, o?.y ?? 0)
}

// glam DAffine2 column-major: [xAxis.x, xAxis.y, yAxis.x, yAxis.y, tx, ty]
function affine(a: number, b: number, c: number, d: number, e: number, f: number): number[] {
  return [r3(a), r3(b), r3(c), r3(d), r3(e), r3(f)]
}

function layerOf(o: any): StrokeLayer {
  return (o?.layer as StrokeLayer) ?? StrokeLayer.UserLayer
}
function chronoLayer(layer: StrokeLayer | string): any {
  if (layer === StrokeLayer.Document) return 'document'
  if (layer === StrokeLayer.Image) return 'image'
  if (layer === StrokeLayer.Highlighter) return 'highlighter'
  return { user_layer: 0 }
}

// ---------- enum normalization ----------
// The writer must *always* emit a token the Rust serde deserializer recognizes:
// an unknown enum variant (or a stray "none") is a hard error and makes the
// whole file fail to open. These guards map every internal web value (and any
// legacy/foreign token) onto the exact desktop variant set.

const PRESSURE_CURVES = ['const', 'linear', 'sqrt', 'cbrt', 'pow2', 'pow3']
const LINE_STYLES = ['solid', 'dotted', 'dashed_narrow', 'dashed_equidistant', 'dashed_wide']
const LINE_CAPS = ['straight', 'rounded']
const FILL_STYLES = ['solid', 'hachure', 'zig_zag', 'zig_zag_line', 'crosshatch', 'dots', 'dashed']
const TEXTURED_DISTRIBUTIONS = ['Uniform', 'Normal', 'Exponential', 'ReverseExponential']
const FONT_STYLES = ['regular', 'italic']
const ALIGNMENTS = ['start', 'center', 'end', 'fill']
const PATTERNS = ['none', 'lines', 'grid', 'dots', 'isometric_grid', 'isometric_dots']
const LAYOUTS = ['fixed_size', 'continuous_vertical', 'semi_infinite', 'infinite']

function token(v: any): string {
  return String(v ?? '').toLowerCase()
}
function enumToken(v: any, allowed: string[], fallback: string): string {
  const t = token(v)
  return allowed.includes(t) ? t : fallback
}
// Web layout enums use hyphens ("continuous-vertical"); the desktop serde
// tokens use underscores ("continuous_vertical"). Normalise both spellings so
// a fixed / continuous document is not silently exported as infinite.
function layoutToken(v: any): string {
  const s = token(v).replace(/-/g, '_')
  if (s.includes('fixed')) return 'fixed_size'
  if (s.includes('semi')) return 'semi_infinite'
  if (s.includes('continuous')) return 'continuous_vertical'
  return 'infinite'
}
function texturedDistribution(v: any): string {
  const t = token(v)
  if (t === 'uniform') return 'Uniform'
  if (t === 'normal') return 'Normal'
  if (t === 'exponential') return 'Exponential'
  if (t === 'reverseexponential' || t === 'reverse_exponential') return 'ReverseExponential'
  return 'Normal'
}
function roughFillStyle(v: any): string {
  const t = token(v)
  // Desktop FillStyle has no "none" variant; a null fill_color already means the
  // fill is not drawn, so degrade "none" to the default hachure token.
  if (t === 'none') return 'hachure'
  return FILL_STYLES.includes(t) ? t : 'hachure'
}

// ---------- styles ----------

function smoothStyle(o: any): any {
  return {
    stroke_width: r3(o?.stroke_width ?? 2),
    stroke_color: color(o?.stroke_color ?? { r: 0, g: 0, b: 0, a: 1 }),
    fill_color: color(o?.fill_color),
    pressure_curve: enumToken(o?.pressure_curve, PRESSURE_CURVES, 'linear'),
    line_style: enumToken(o?.line_style, LINE_STYLES, 'solid'),
    line_cap: enumToken(o?.line_cap, LINE_CAPS, 'straight')
  }
}

function roughStyle(o: any): any {
  return {
    stroke_color: color(o?.stroke_color ?? { r: 0, g: 0, b: 0, a: 1 }),
    stroke_width: r3(o?.stroke_width ?? 2.4),
    fill_color: color(o?.fill_color),
    fill_style: roughFillStyle(o?.fill_style),
    hachure_angle: r3(o?.hachure_angle ?? -0.715585),
    seed: o?.seed ?? null
  }
}

function texturedStyle(o: any): any {
  return {
    seed: o?.seed ?? null,
    stroke_width: r3(o?.stroke_width ?? 6),
    stroke_color: color(o?.stroke_color ?? { r: 0, g: 0, b: 0, a: 1 }),
    density: r3(o?.density ?? 5),
    distribution: texturedDistribution(o?.distribution),
    pressure_curve: enumToken(o?.pressure_curve, PRESSURE_CURVES, 'linear')
  }
}

// ---------- brush ----------

// Port of PenPathCurvedBuilder: the desktop curved builder emits an initial
// zero-length LineTo at the start, Catmull-Rom CubBezTo segments while drawing,
// and a final LineTo on pen-up. The Simple/Modeled builders emit plain LineTo.
function curvedSegments(els: any[]): any[] {
  const n = els.length
  if (n < 1) return []
  const el = (k: number) => ({ pos: pt(els[k].pos), pressure: r3(els[k].pressure ?? 0.5) })
  // Catmull-Rom (tension = 1): cubic from b to c, surrounded by a,d.
  const cr = (a: any, b: any, c: any, d: any) => {
    const bx = b.pos.x, by = b.pos.y
    const cp1 = { x: bx + (c.pos.x - a.pos.x) / 6, y: by + (c.pos.y - a.pos.y) / 6 }
    const cp2 = { x: c.pos.x - (d.pos.x - bx) / 6, y: c.pos.y - (d.pos.y - by) / 6 }
    if (Math.hypot(c.pos.x - bx, c.pos.y - by) === 0) return null
    return { cp1, cp2 }
  }
  const segs: any[] = []
  const buffer = [els[0]]
  let i = 0
  let state: 'Start' | 'During' = 'Start'
  for (let k = 1; k < n; k++) {
    const isUp = k === n - 1
    buffer.push(els[k])
    if (isUp) {
      // try_build_segments_end
      const last = buffer.length - 1
      for (;;) {
        let made: any[] | null = null
        if (last > i + 2) {
          const cb = cr(buffer[i], buffer[i + 1], buffer[i + 2], buffer[i + 3])
          if (cb) {
            made = [{ cubbezto: { cp1: vec2(cb.cp1.x, cb.cp1.y), cp2: vec2(cb.cp2.x, cb.cp2.y), end: el(i + 2) } }]
          } else {
            made = [{ lineto: { end: el(i + 2) } }]
          }
          i += 1
        } else if (last > i + 1) {
          made = [{ lineto: { end: el(i + 1) } }]
          i += 2
        } else if (last > i) {
          made = [{ lineto: { end: el(i) } }]
          i += 1
        }
        if (!made) break
        segs.push(...made)
      }
    } else if (state === 'Start') {
      // try_build_segments_start
      if (buffer.length - 1 > i) {
        segs.push({ lineto: { end: el(i) } })
        state = 'During'
      }
    } else {
      // try_build_segments_during
      while (buffer.length - 1 >= i + 3) {
        const cb = cr(buffer[i], buffer[i + 1], buffer[i + 2], buffer[i + 3])
        if (cb) {
          segs.push({ cubbezto: { cp1: vec2(cb.cp1.x, cb.cp1.y), cp2: vec2(cb.cp2.x, cb.cp2.y), end: el(i + 2) } })
        } else {
          segs.push({ lineto: { end: el(i + 2) } })
        }
        i += 1
      }
    }
  }
  return segs
}

function exportBrush(o: any): any {
  let path: any
  if (o.start && Array.isArray(o.segments)) {
    // The stroke already stores native bezier segments; reuse them verbatim so
    // the exported path is exactly the fitted, lossless path.
    path = { start: o.start, segments: o.segments }
  } else {
  const els: any[] = o.elements ?? []
  if (els.length < 1) return null
  const start = els[0]
  const lineElement = (e: any) => ({
    lineto: { end: { pos: pt(e.pos), pressure: r3(e.pressure ?? 0.5) } }
  })
  // Only the curved builder produces CubBezTo; simple/modeled are polylines.
  const segments =
    o.builder_type === 'simple' || o.builder_type === 'modeled'
      ? els.slice(1).map(lineElement)
      : curvedSegments(els)
  path = {
    start: { pos: pt(start.pos), pressure: r3(start.pressure ?? 0.5) },
    segments
  }
  }
  let style: any
  if (o.style_kind === 'textured') {
    style = { textured: texturedStyle(o.textured) }
  } else {
    // solid and marker are both native smooth brush strokes; the marker
    // identity is carried by the highlighter chrono layer + const curve.
    const s = { ...(o.smooth ?? {}) }
    if (o.style_kind === 'marker') s.pressure_curve = 'const'
    style = { smooth: smoothStyle(s) }
  }
  return { brushstroke: { path, style } }
}

// ---------- shapes ----------

function exportShape(s: any): any | null {
  switch (s.kind) {
    case 'line':
      return { line: { start: pt(s.start), end: pt(s.end) } }
    case 'arrow':
      // Native Arrow stores `tip` and only supports the open chevron head.
      return { arrow: { start: pt(s.start), tip: pt(s.end) } }
    case 'rectangle': {
      const cx = (s.rect.min.x + s.rect.max.x) / 2
      const cy = (s.rect.min.y + s.rect.max.y) / 2
      const hx = Math.abs(s.rect.max.x - s.rect.min.x) / 2
      const hy = Math.abs(s.rect.max.y - s.rect.min.y) / 2
      return {
        rect: {
          cuboid: { half_extents: vec2(hx, hy) },
          affine: affine(1, 0, 0, 1, cx, cy)
        }
      }
    }
    case 'ellipse': {
      const rot = s.rotation ?? 0
      const cos = Math.cos(rot)
      const sin = Math.sin(rot)
      return {
        ellipse: {
          radii: vec2(s.radii?.x ?? 1, s.radii?.y ?? 1),
          affine: affine(cos, sin, -sin, cos, s.center?.x ?? 0, s.center?.y ?? 0)
        }
      }
    }
    case 'quadbez':
      return { quadbez: { start: pt(s.start), cp: pt(s.cp), end: pt(s.end) } }
    case 'cubbez':
      return {
        cubbez: { start: pt(s.start), cp1: pt(s.cp1), cp2: pt(s.cp2), end: pt(s.end) }
      }
    case 'polyline':
    case 'polygon': {
      const points: any[] = s.points ?? []
      if (points.length < 2) return null
      return {
        [s.kind]: { start: pt(points[0]), path: points.slice(1).map(pt) }
      }
    }
    default:
      return null
  }
}

function exportShapeStroke(o: any): any[] {
  const shapes: any[] = (o.shapes ?? []).map(exportShape).filter(Boolean)
  if (!shapes.length) return []
  const style = o.rough_enabled
    ? { rough: roughStyle(o.rough) }
    : { smooth: smoothStyle(o.smooth) }
  return shapes.map((shape) => ({ shapestroke: { shape, style } }))
}

// ---------- text ----------

function stripHtml(html: string): string {
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      doc.body.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
      doc.body.querySelectorAll('div,p').forEach((b) => {
        if (b.previousSibling) b.insertBefore(document.createTextNode('\n'), b.firstChild)
      })
      return doc.body.textContent ?? ''
    } catch {
      /* fall through */
    }
  }
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function fontFamilyToken(family: string): string {
  const first = String(family ?? 'serif').split(',')[0].trim().replace(/^["']|["']$/g, '')
  if (/^sans$/i.test(first)) return 'sans-serif'
  if (/^mono/i.test(first)) return 'monospace'
  return first || 'serif'
}

function exportTextStroke(o: any): any | null {
  const text = stripHtml(o.html ?? '')
  if (!text.trim()) return null
  const st = o.style ?? {}
  const tx = o.translation ?? { x: 0, y: 0 }
  const rot = o.rotation ?? 0
  const scale = o.scale ?? 1
  const cos = Math.cos(rot) * scale
  const sin = Math.sin(rot) * scale
  const weight = Math.round(st.weight ?? 500)
  const italic = !!st.italic
  const attrs: any[] = []
  // Rust RangedTextAttribute uses UTF-8 byte offsets into String, not JS UTF-16
  // string lengths.
  const byteLength = new TextEncoder().encode(text).length
  const range = { start: 0, end: byteLength }
  if (weight !== 500) attrs.push({ range, attribute: { font_weight: weight } })
  if (st.underline) attrs.push({ range, attribute: { underline: true } })
  if (st.strike) attrs.push({ range, attribute: { strikethrough: true } })
  return {
    textstroke: {
      text,
      affine: affine(cos, sin, -sin, cos, tx.x, tx.y),
      text_style: {
        font_family: fontFamilyToken(st.family ?? 'serif'),
        font_size: r3(st.size ?? 32),
        font_weight: weight,
        font_style: italic ? 'italic' : 'regular',
        color: color(st.color ?? { r: 0, g: 0, b: 0, a: 1 }),
        max_width: r3((o.width ?? 600) / Math.max(scale, 1e-6)),
        alignment: enumToken(st.alignment, ALIGNMENTS, 'start'),
        ranged_text_attributes: attrs
      }
    }
  }
}

// ---------- images ----------

function parseSvgIntrinsic(svg: string, fallbackW: number, fallbackH: number): [number, number] {
  const vb = svg.match(/viewBox\s*=\s*["'][^"']*?(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)["']/i)
  if (vb) return [parseFloat(vb[3]), parseFloat(vb[4])]
  const w = parseFloat(svg.match(/<svg[^>]*\bwidth\s*=\s*["']?([\d.]+)/i)?.[1] ?? '')
  const h = parseFloat(svg.match(/<svg[^>]*\bheight\s*=\s*["']?([\d.]+)/i)?.[1] ?? '')
  return [w || fallbackW, h || fallbackH]
}

function exportVector(o: any): any | null {
  const svg: string = o.svg_source ?? ''
  if (!svg.trim()) return null
  const min = o.rect?.min ?? { x: 0, y: 0 }
  const max = o.rect?.max ?? { x: 0, y: 0 }
  const w = max.x - min.x
  const h = max.y - min.y
  const [iw, ih] = parseSvgIntrinsic(svg, Math.max(w, 1), Math.max(h, 1))
  const hx = w / 2
  const hy = h / 2
  const cx = min.x + w / 2
  const cy = min.y + h / 2
  return {
    vectorimage: {
      svg_data: svg,
      intrinsic_size: vec2(iw, ih),
      rectangle: {
        cuboid: { half_extents: vec2(hx, hy) },
        // Desktop vector images bake the final document size into the cuboid and
        // use the affine only for placement (SVG viewBox handles scaling).
        affine: affine(1, 0, 0, 1, cx, cy)
      }
    }
  }
}

async function decodeDataUrl(dataUrl: string): Promise<ImageData | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  const bmp = await createImageBitmap(blob)
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const oc = new OffscreenCanvas(bmp.width, bmp.height)
      const ctx = oc.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(bmp, 0, 0)
      return ctx.getImageData(0, 0, bmp.width, bmp.height)
    }
    const canvas = document.createElement('canvas')
    canvas.width = bmp.width
    canvas.height = bmp.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bmp, 0, 0)
    return ctx.getImageData(0, 0, bmp.width, bmp.height)
  } finally {
    bmp.close?.()
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

// Desktop stores premultiplied straight RGBA bytes (R8g8b8a8Premultiplied).
async function exportBitmap(o: any): Promise<any | null> {
  const dataUrl: string = o.data_url ?? ''
  const min = o.rect?.min ?? { x: 0, y: 0 }
  const max = o.rect?.max ?? { x: 0, y: 0 }
  const w = max.x - min.x
  const h = max.y - min.y
  const pw = Math.round(o.pixel_width || w)
  const ph = Math.round(o.pixel_height || h)
  const img = await decodeDataUrl(dataUrl)
  if (!img) {
    // Node / environments without canvas: pixel bytes cannot be produced.
    console.warn('desktop bitmap export needs a browser canvas; skipping bitmap stroke')
    return null
  }
  const src = img.data
  // Canvas ImageData and Rust's `Image::try_from_encoded_bytes()` path both use
  // straight (non-premultiplied) RGBA bytes. Desktop still labels these as
  // R8g8b8a8Premultiplied for piet; cairo-rendered images may be premultiplied,
  // but imported raster files are serialized without a premultiply step.
  const raw = new Uint8Array(src)
  const cx = min.x + w / 2
  const cy = min.y + h / 2
  const sx = w / pw
  const sy = h / ph
  return {
    bitmapimage: {
      image: {
        data: bytesToBase64(raw),
        rectangle: {
          cuboid: { half_extents: vec2(pw / 2, ph / 2) },
          affine: affine(1, 0, 0, 1, pw / 2, ph / 2)
        },
        pixel_width: pw,
        pixel_height: ph,
        memory_format: 'R8g8b8a8Premultiplied'
      },
      rectangle: {
        // Desktop BitmapImage keeps source-pixel half-extents in the cuboid and
        // scales pixel -> document coordinates through the affine.
        cuboid: { half_extents: vec2(pw / 2, ph / 2) },
        affine: affine(sx, 0, 0, sy, cx, cy)
      }
    }
  }
}

// ---------- document / camera ----------

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function include(b: Bounds, x0: number, y0: number, x1: number, y1: number, pad = 0) {
  b.minX = Math.min(b.minX, x0 - pad)
  b.minY = Math.min(b.minY, y0 - pad)
  b.maxX = Math.max(b.maxX, x1 + pad)
  b.maxY = Math.max(b.maxY, y1 + pad)
}
function mergeBounds(a: Bounds, b: Bounds) {
  include(a, b.minX, b.minY, b.maxX, b.maxY)
}
function extendBounds(b: Bounds, px: number, py = px): Bounds {
  return { minX: b.minX - px, minY: b.minY - py, maxX: b.maxX + px, maxY: b.maxY + py }
}
function boundsContains(outer: Bounds, inner: Bounds): boolean {
  return (
    outer.minX <= inner.minX &&
    outer.minY <= inner.minY &&
    outer.maxX >= inner.maxX &&
    outer.maxY >= inner.maxY
  )
}

function strokeBounds(o: any): Bounds | null {
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  if (o.kind === 'brush') {
    for (const e of o.elements ?? []) include(b, e.pos.x, e.pos.y, e.pos.x, e.pos.y, (o.smooth?.stroke_width ?? o.textured?.stroke_width ?? 2) / 2)
  } else if (o.kind === 'shape') {
    for (const s of o.shapes ?? []) {
      const pts: any[] = []
      if (s.start) pts.push(s.start, s.end)
      if (s.rect) pts.push(s.rect.min, s.rect.max, { x: s.rect.min.x, y: s.rect.max.y }, { x: s.rect.max.x, y: s.rect.min.y })
      if (s.center) {
        const rot = s.rotation ?? 0
        const cos = Math.cos(rot)
        const sin = Math.sin(rot)
        const rx = s.radii?.x ?? 0
        const ry = s.radii?.y ?? 0
        for (const [lx, ly] of [[-rx, -ry], [rx, -ry], [rx, ry], [-rx, ry]] as const) {
          pts.push({ x: s.center.x + lx * cos - ly * sin, y: s.center.y + lx * sin + ly * cos })
        }
      }
      if (s.points) pts.push(...s.points)
      if (s.cp) pts.push(s.cp)
      if (s.cp1) pts.push(s.cp1, s.cp2)
      for (const p of pts) include(b, p.x, p.y, p.x, p.y, (o.smooth?.stroke_width ?? o.rough?.stroke_width ?? 2) / 2)
    }
  } else if (o.kind === 'text') {
    const t = o.translation ?? { x: 0, y: 0 }
    const sc = o.scale ?? 1
    const size = o.style?.size ?? 32
    const plain = stripHtml(o.html ?? '')
    const boxW = (o.width ?? 100) * sc
    const lineH = size * 1.2 * sc
    let lines = 0
    for (const paragraph of plain.split('\n')) {
      const estCharsPerLine = Math.max(1, (o.width ?? 100) / (size * 0.5))
      lines += Math.max(1, Math.ceil(Math.max(1, paragraph.length) / estCharsPerLine))
    }
    include(b, t.x, t.y, t.x + boxW, t.y + lines * lineH)
  } else if (o.kind === 'bitmap' || o.kind === 'vector') {
    include(b, o.rect.min.x, o.rect.min.y, o.rect.max.x, o.rect.max.y)
  }
  return Number.isFinite(b.minX) ? b : null
}

function exportDocument(snap: EngineSnapshot, strokes: any[], camera: any): any {
  const doc: any = snap.document ?? {}
  const format = doc.format ?? {}
  const bg = doc.background ?? {}
  const fw = format.width ?? 1123
  const fh = format.height ?? 1587
  const layout = layoutToken(doc.layout)

  const content: Bounds | null = strokes
    .map(strokeBounds)
    .filter((b): b is Bounds => !!b)
    .reduce((acc: Bounds | null, b) => {
      if (!acc) return { ...b }
      mergeBounds(acc, b)
      return acc
    }, null)

  // calc_height() in Rust folds Y bounds with origin: min(0, mins.y) and
  // max(0, maxs.y); calc_width() has the same X semantics.
  const calcHeight = content ? Math.max(0, content.maxY) - Math.min(0, content.minY) : 0
  let x = 0
  let y = 0
  let width = fw
  let height = fh
  if (layout === 'fixed_size') {
    height = Math.max(1, Math.ceil(Math.max(calcHeight, 1) / fh) * fh)
  } else if (layout === 'continuous_vertical') {
    height = calcHeight + fh
  } else {
    // Semi-infinite and infinite layouts expand while editing with two pages
    // of padding around both the camera viewport and the content.
    const padX = fw * 2
    const padY = fh * 2
    const bounds: Bounds = { minX: 0, minY: 0, maxX: fw, maxY: fh }
    const camOffset = camera?.offset ?? { x: -96, y: -96 }
    const camSize = camera?.size ?? { x: 800, y: 600 }
    const zoom = camera?.zoom ?? 1
    const sizeX = camSize.x ?? camSize[0] ?? 800
    const sizeY = camSize.y ?? camSize[1] ?? 600
    // offset is in surface coords; convert to document coords (/ zoom).
    const viewport: Bounds = {
      minX: camOffset.x / zoom,
      minY: camOffset.y / zoom,
      maxX: (camOffset.x + sizeX) / zoom,
      maxY: (camOffset.y + sizeY) / zoom
    }
    const minimum = extendBounds(viewport, padX, padY)
    if (!boundsContains(bounds, minimum)) {
      mergeBounds(bounds, extendBounds(minimum, padX, padY))
    }
    if (content) {
      const padded = extendBounds(content, padX, padY)
      if (layout === 'semi_infinite') {
        // Rust clamps the expanded origin to the current document origin and
        // only grows to the right / bottom.
        padded.minX = Math.max(padded.minX, bounds.minX)
        padded.minY = Math.max(padded.minY, bounds.minY)
      }
      mergeBounds(bounds, padded)
    }
    if (layout === 'semi_infinite') {
      x = 0
      y = 0
      width = bounds.maxX
      height = bounds.maxY
    } else {
      x = bounds.minX
      y = bounds.minY
      width = bounds.maxX - bounds.minX
      height = bounds.maxY - bounds.minY
    }
  }

  return {
    config: {
      format: {
        width: r3(fw),
        height: r3(fh),
        dpi: Math.round(format.dpi ?? 96),
        orientation: format.orientation ?? (fw > fh ? 'landscape' : 'portrait'),
        border_color: color(format.border_color ?? { r: 0.871, g: 0.867, b: 0.855, a: 1 }),
        show_borders: format.show_border ?? true,
        show_origin_indicator: true
      },
      background: {
        color: color(bg.color ?? { r: 1, g: 1, b: 1, a: 1 }),
        pattern: enumToken(bg.pattern, PATTERNS, 'dots'),
        pattern_size: vec2(bg.pattern_size?.x ?? 32, bg.pattern_size?.y ?? 32),
        pattern_color: color(bg.pattern_color ?? { r: 0.8, g: 0.9, b: 1, a: 1 })
      },
      layout
    },
    x: r3(x),
    y: r3(y),
    width: r3(width),
    height: r3(height)
  }
}

// ---------- entry point ----------

export async function buildDesktopSnapshot(snap: EngineSnapshot): Promise<any> {
  const strokes: any[] = snap.store?.strokes ?? []
  const components: any[] = []
  const chronos: any[] = []
  let t = 0
  for (const s of strokes) {
    let natives: any[] = []
    const layer = layerOf(s)
    if (s.kind === 'brush') {
      const n = exportBrush(s)
      if (n) natives.push(n)
    } else if (s.kind === 'shape') {
      natives = exportShapeStroke(s)
    } else if (s.kind === 'text') {
      const n = exportTextStroke(s)
      if (n) natives.push(n)
    } else if (s.kind === 'vector') {
      const n = exportVector(s)
      if (n) natives.push(n)
    } else if (s.kind === 'bitmap') {
      const n = await exportBitmap(s)
      if (n) natives.push(n)
    }
    for (const n of natives) {
      components.push({ value: n, version: 1 })
      chronos.push({ value: { t, layer: chronoLayer(layer) }, version: 1 })
      t += 1
    }
  }
  const camera = snap.camera as any
  const camSize = camera?.size ?? {}
  const camZoom = camera?.zoom ?? 1
  return {
    document: exportDocument(snap, strokes, camera),
    camera: {
      // web and desktop both store the offset in surface (zoomed) coords.
      offset: vec2(camera?.offset?.x ?? -96, camera?.offset?.y ?? -96),
      size: [Math.round(camSize.x ?? camSize[0] ?? 800), Math.round(camSize.y ?? camSize[1] ?? 600)],
      zoom: r3(camZoom)
    },
    stroke_components: [SLOT_SENTINEL, ...components],
    chrono_components: [SLOT_SENTINEL, ...chronos],
    chrono_counter: t
  }
}

export const DESKTOP_RNOTE_VERSION = '0.15.0'
