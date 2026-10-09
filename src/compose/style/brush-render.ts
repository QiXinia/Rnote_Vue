// Brush rendering for rnote-compose pen paths:
//  - Solid pen  : variable-width filled outline driven by pressure
//  - Marker     : constant-width filled outline on the highlighter chrono layer
//  - Textured   : stamped dots / short lines with density & distribution
//
// Rnote renders modeled/curved strokes as filled outlines; the dense
// centerline + variable-width outline in penpath.ts reproduces that result.

import { Vec2 } from '../geometry'
import { PenPath } from '../penpath/penpath'
import {
  SmoothOptions,
  TexturedOptions,
  TexturedDotsDistribution,
  TexturedShape,
  applyPressureCurve
} from './options'
import { Pcg64, seedAdvance } from './rand/pcg64'
import { UniformF64, normalSample, exp1 } from './rand/distributions'

export interface BrushRenderResult {
  boundsPadding: number
}

interface PathSink {
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  closePath(): void
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number): void
}

function tracePolygon(sink: PathSink, poly: Vec2[]) {
  if (poly.length < 3) return
  sink.moveTo(poly[0].x, poly[0].y)
  for (let i = 1; i < poly.length; i++) sink.lineTo(poly[i].x, poly[i].y)
  sink.closePath()
}

// Build the filled variable-width outline as a document-space Path2D. The path
// is independent of zoom and DPR so it can be built once per stroke and reused
// every frame; the canvas transform scales it losslessly, exactly like Rnote's
// cached kurbo BezPath.
export function buildSmoothPath(
  path: PenPath,
  options: SmoothOptions,
  isMarker: boolean
): Path2D | null {
  const sink = new Path2D()

  // A tap / fully coincident path renders as a dot.
  const dot = path.dotCenter()
  if (dot) {
    const width = isMarker ? options.stroke_width : strokeWidthAt(dot.pressure, options)
    sink.moveTo(dot.pos.x + width * 0.5, dot.pos.y)
    sink.arc(dot.pos.x, dot.pos.y, width * 0.5, 0, Math.PI * 2)
    return sink
  }

  // Fitted strokes sample the stored bezier segments (lossless, zoom
  // independent); a live stroke interpolates its raw elements. Each group
  // spans one captured interval with pressure interpolated across it.
  const groups = path.sampleGroups(2.0)
  for (const g of groups) {
    const w0 = isMarker ? options.stroke_width : strokeWidthAt(g.sp, options)
    const w1 = isMarker ? options.stroke_width : strokeWidthAt(g.ep, options)
    const poly = composeLinesVariableWidth(g.lines, w0, w1)
    tracePolygon(sink, poly)
  }
  return sink
}

// Solid / marker smooth brush. Desktop Rnote always fills a variable-width
// outline; marker is the same renderer with constant pressure on a lower layer.
export function drawSmoothBrush(
  ctx: CanvasRenderingContext2D,
  path: PenPath,
  options: SmoothOptions,
  isMarker: boolean
): void {
  const color = options.stroke_color
  if (!color || path.elements.length === 0) return
  const filled = buildSmoothPath(path, options, isMarker)
  if (!filled) return

  ctx.save()
  ctx.globalAlpha = color.a
  ctx.fillStyle = color.toCss(1)
  ctx.fill(filled, 'nonzero')
  ctx.restore()
}

// Incremental renderer for the in-progress (active) stroke. A full rebuild on
// every pointer move allocates O(n) temporary geometry per frame and O(n^2)
// over a whole stroke, which triggers occasional long GC pauses. Catmull-Rom
// segment i only depends on elements[i-1..i+2]; once element[i+2] exists and
// is no longer a clamped boundary (i <= n-3), that segment is final and is
// baked once into `frozen`. Each frame only the new segment is appended and the
// single trailing (still mutable) segment is re-traced.
export class ActiveSmoothRenderer {
  private frozen = new Path2D()
  private frozenCount = 0

  reset() {
    this.frozen = new Path2D()
    this.frozenCount = 0
  }

  private traceSegment(sink: Path2D, path: PenPath, i: number, options: SmoothOptions, isMarker: boolean) {
    const first = path.elements[i]
    const last = path.elements[i + 1]
    if (!first || !last || first.pos.equals(last.pos)) return
    const startWidth = isMarker ? options.stroke_width : strokeWidthAt(first.pressure, options)
    const endWidth = isMarker ? options.stroke_width : strokeWidthAt(last.pressure, options)
    const center = path.segmentCenterline(i, 2)
    const lines = center.slice(0, -1).map((start, j) => ({ start, end: center[j + 1] }))
    const poly = composeLinesVariableWidth(lines, startWidth, endWidth)
    tracePolygon(sink, poly)
  }

  draw(ctx: CanvasRenderingContext2D, path: PenPath, options: SmoothOptions, isMarker: boolean) {
    const color = options.stroke_color
    const n = path.elements.length
    if (!color || n === 0) return
    if (n === 1) {
      const w = isMarker ? options.stroke_width : strokeWidthAt(path.elements[0].pressure, options)
      ctx.save()
      ctx.globalAlpha = color.a
      ctx.fillStyle = color.toCss(1)
      ctx.beginPath()
      ctx.arc(path.elements[0].pos.x, path.elements[0].pos.y, w * 0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      return
    }
    while (this.frozenCount <= n - 3) {
      this.traceSegment(this.frozen, path, this.frozenCount, options, isMarker)
      this.frozenCount++
    }
    ctx.save()
    ctx.globalAlpha = color.a
    ctx.fillStyle = color.toCss(1)
    ctx.fill(this.frozen, 'nonzero')
    const tail = new Path2D()
    this.traceSegment(tail, path, n - 2, options, isMarker)
    ctx.fill(tail, 'nonzero')
    ctx.restore()
  }
}
// directly; non-pressure devices store Element::PRESSURE_DEFAULT = 0.5.
export function strokeWidthAt(p: number, options: SmoothOptions): number {
  return options.stroke_width * applyPressureCurve(p, options.pressure_curve)
}

interface RenderLine {
  start: Vec2
  end: Vec2
}

function pointLineDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = b.sub(a)
  const len = ab.length()
  if (len === 0) return p.distance(a)
  const t = Math.max(0, Math.min(1, p.sub(a).dot(ab) / (len * len)))
  return p.distance(a.add(ab.mul(t)))
}

function flattenCubic(p0: Vec2, c1: Vec2, c2: Vec2, p3: Vec2, depth = 0): Vec2[] {
  const flat = pointLineDistance(c1, p0, p3) < 0.25 && pointLineDistance(c2, p0, p3) < 0.25
  if (flat || depth >= 14) return [p3.clone()]

  const q1 = p0.lerp(c1, 0.5)
  const q2 = c1.lerp(c2, 0.5)
  const q3 = c2.lerp(p3, 0.5)
  const r1 = q1.lerp(q2, 0.5)
  const r2 = q2.lerp(q3, 0.5)
  const s = r1.lerp(r2, 0.5)
  return [
    ...flattenCubic(p0, q1, r1, s, depth + 1),
    ...flattenCubic(s, r2, q3, p3, depth + 1)
  ]
}

// Exact TypeScript port of rnote-compose smooth::compose_lines_variable_width.
// It returns one closed filled outline; line cap is the desktop cubic cap, not
// a Canvas line cap or a circular arc approximation.
export function composeLinesVariableWidth(
  lines: RenderLine[],
  startWidth: number,
  endWidth: number
): Vec2[] {
  const usable = lines.filter((line) => line.end.sub(line.start).length() > 0)
  const n = usable.length
  if (n === 0) return []

  const positive: Vec2[] = []
  const negative: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const line = usable[i]
    const lineStartWidth = startWidth + (endWidth - startWidth) * (i / n)
    const lineEndWidth = startWidth + (endWidth - startWidth) * ((i + 1) / n)
    const orth = line.end.sub(line.start).perp().normalize()

    positive.push(
      line.start.add(orth.mul(lineStartWidth * 0.5)),
      line.end.add(orth.mul(lineEndWidth * 0.5))
    )
    negative.push(
      line.start.sub(orth.mul(lineStartWidth * 0.5)),
      line.end.sub(orth.mul(lineEndWidth * 0.5))
    )
  }

  const first = usable[0]
  const last = usable[n - 1]
  const startDir = first.end.sub(first.start).normalize()
  const endDir = last.end.sub(last.start).normalize()
  const out: Vec2[] = [negative[0].clone()]

  if (startWidth > 0 && !positive[0].equals(negative[0])) {
    out.push(
      ...flattenCubic(
        negative[0],
        negative[0].sub(startDir.mul(startWidth * (2 / 3))),
        positive[0].sub(startDir.mul(startWidth * (2 / 3))),
        positive[0]
      )
    )
  } else {
    out.push(positive[0].clone())
  }

  positive.slice(1).forEach((p) => out.push(p.clone()))

  const lastPositive = positive[positive.length - 1]
  const lastNegative = negative[negative.length - 1]
  if (endWidth > 0 && !lastPositive.equals(lastNegative)) {
    out.push(
      ...flattenCubic(
        lastPositive,
        lastPositive.add(endDir.mul(endWidth * (2 / 3))),
        lastNegative.add(endDir.mul(endWidth * (2 / 3))),
        lastNegative
      )
    )
  } else {
    out.push(lastNegative.clone())
  }

  negative.slice(0, -1).reverse().forEach((p) => out.push(p.clone()))
  return out
}

// Textured brush: exact port of rnote-compose textured/mod.rs. Each chord of
// the pen path becomes a swept rectangle; dots are stamped with one fresh
// Pcg64 per segment, seeded/advanced exactly like TexturedOptions.
type TexturedDotKind = 'circle' | 'ellipse' | 'rhombus' | 'rectangle'
interface TexturedDot {
  x: number
  y: number
  rot: number
  rx: number
  ry: number
  kind: TexturedDotKind
}

function texturedDotKind(shape: TexturedShape): TexturedDotKind {
  switch (shape) {
    case TexturedShape.Lines:
      return 'rectangle'
    case TexturedShape.Grid:
      return 'rhombus'
    case TexturedShape.Dots:
    default:
      return 'circle'
  }
}

export function generateTexturedDots(
  path: PenPath,
  options: TexturedOptions
): TexturedDot[] {
  const els = path.elements
  if (els.length < 2) return []
  const dots: TexturedDot[] = []
  const kind = texturedDotKind(options.shape)
  let seed: number | null = options.seed

  for (let i = 1; i < els.length; i++) {
    const start = els[i - 1]
    const end = els[i]
    if (end.pos.x === start.pos.x && end.pos.y === start.pos.y) {
      if (seed !== null) seed = Number(seedAdvance(BigInt(seed)) & 0xffffffffffffffffn)
      continue
    }

    const width =
      options.stroke_width *
      applyPressureCurve(0.5 * (start.pressure + end.pressure), options.pressure_curve)

    const rng = new Pcg64(seed === null ? null : BigInt(seed))

    const dx = end.pos.x - start.pos.x
    const dy = end.pos.y - start.pos.y
    const len = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)
    const hx = len * 0.5
    const hy = width * 0.5
    const area = 4 * hx * hy
    const nDots = Math.round(area * 0.1 * options.density)

    const radiusX = 1.2 * (1 + width * 0.1)
    const radiusY = 0.3 * (1 + width * 0.1)
    const ux = UniformF64.new(-hx, hx)
    const uyRange = UniformF64.new(-hy, hy)
    const urot = UniformF64.new(-Math.PI / 8, Math.PI / 8)
    const urx = UniformF64.new(0.8 * radiusX, 1.25 * radiusX)
    const ury = UniformF64.new(0.8 * radiusY, 1.25 * radiusY)

    const mx = (start.pos.x + end.pos.x) * 0.5
    const my = (start.pos.y + end.pos.y) * 0.5
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)

    for (let n = 0; n < nDots; n++) {
      // RNG call order must match textured/mod.rs: y, x, rotation, radii.
      let yPos: number
      switch (options.distribution) {
        case TexturedDotsDistribution.Uniform:
          yPos = uyRange.sample(rng)
          break
        case TexturedDotsDistribution.Normal:
          yPos = Math.abs(normalSample(rng, 0, hy))
          break
        case TexturedDotsDistribution.Exponential: {
          // Exp::new(1/hy).sample() == Exp1 * hy, clipped to the rect.
          yPos = exp1(rng) * hy
          if (yPos > hy) yPos = hy
          break
        }
        case TexturedDotsDistribution.ReverseExponential: {
          yPos = hy - exp1(rng) * hy
          if (yPos < 0) yPos = 0
          break
        }
        default:
          yPos = uyRange.sample(rng)
      }
      const xPos = ux.sample(rng)
      const rotation = urot.sample(rng)
      const rx = urx.sample(rng)
      const ry = kind === 'circle' ? rx : ury.sample(rng)

      dots.push({
        x: mx + cos * xPos - sin * yPos,
        y: my + sin * xPos + cos * yPos,
        rot: angle + rotation,
        rx,
        ry,
        kind
      })
    }

    if (seed !== null) seed = Number(seedAdvance(BigInt(seed)) & 0xffffffffffffffffn)
  }
  return dots
}

function traceDot(sink: PathSink, d: TexturedDot) {
  if (d.kind === 'circle' || d.kind === 'ellipse') {
    sink.ellipse(d.x, d.y, d.rx, d.ry, d.rot, 0, Math.PI * 2)
  } else {
    const cos = Math.cos(d.rot)
    const sin = Math.sin(d.rot)
    const local: Array<[number, number]> =
      d.kind === 'rhombus'
        ? [[d.rx, 0], [0, d.ry], [-d.rx, 0], [0, -d.ry]]
        : [[d.rx, d.ry], [-d.rx, d.ry], [-d.rx, -d.ry], [d.rx, -d.ry]]
    local.forEach(([lx, ly], i) => {
      const x = d.x + cos * lx - sin * ly
      const y = d.y + sin * lx + cos * ly
      if (i === 0) sink.moveTo(x, y)
      else sink.lineTo(x, y)
    })
    sink.closePath()
  }
}

// Document-space Path2D for a textured brush (deterministic stamps), cached on
// the stroke like the smooth outline.
export function buildTexturedPath(path: PenPath, options: TexturedOptions): Path2D | null {
  const dots = generateTexturedDots(path, options)
  if (dots.length === 0) return null
  const sink = new Path2D()
  for (const d of dots) traceDot(sink, d)
  return sink
}

export function drawTexturedBrush(
  ctx: CanvasRenderingContext2D,
  path: PenPath,
  options: TexturedOptions
): void {
  const color = options.stroke_color
  if (!color) return
  const filled = buildTexturedPath(path, options)
  if (!filled) return

  ctx.save()
  ctx.fillStyle = color.toCss(1)
  ctx.globalAlpha = color.a
  ctx.fill(filled, 'nonzero')
  ctx.restore()
}

// Lossless vector SVG for a textured brush: the same deterministic stamps.
export function texturedBrushSVG(
  path: PenPath,
  options: TexturedOptions,
  colorHex: string,
  alpha: number
): string {
  const dots = generateTexturedDots(path, options)
  if (dots.length === 0) return ''
  const rr = (v: number) => Math.round(v * 1000) / 1000
  const parts: string[] = []
  for (const d of dots) {
    const deg = (d.rot * 180) / Math.PI
    if (d.kind === 'circle' || d.kind === 'ellipse') {
      parts.push(
        `<ellipse cx="${rr(d.x)}" cy="${rr(d.y)}" rx="${rr(d.rx)}" ry="${rr(d.ry)}" transform="rotate(${rr(deg)} ${rr(d.x)} ${rr(d.y)})" fill="${colorHex}"${alpha < 1 ? ` fill-opacity="${rr(alpha)}"` : ''}/>`
      )
    } else {
      const cos = Math.cos(d.rot)
      const sin = Math.sin(d.rot)
      const local: Array<[number, number]> =
        d.kind === 'rhombus'
          ? [[d.rx, 0], [0, d.ry], [-d.rx, 0], [0, -d.ry]]
          : [[d.rx, d.ry], [-d.rx, d.ry], [-d.rx, -d.ry], [d.rx, -d.ry]]
      const pts = local
        .map(([lx, ly]) => `${rr(d.x + cos * lx - sin * ly)},${rr(d.y + sin * lx + cos * ly)}`)
        .join(' ')
      parts.push(`<polygon points="${pts}" fill="${colorHex}"${alpha < 1 ? ` fill-opacity="${rr(alpha)}"` : ''}/>`)
    }
  }
  return parts.join('')
}

// Variable-width outlines exposed for SVG export of a smooth brush.
export function brushOutlines(path: PenPath, options: SmoothOptions, isMarker = false): Vec2[][] {
  const dot = path.dotCenter()
  if (dot) {
    const width = isMarker ? options.stroke_width : strokeWidthAt(dot.pressure, options)
    const p = dot.pos
    const out: Vec2[] = []
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      out.push(new Vec2(p.x + Math.cos(a) * width * 0.5, p.y + Math.sin(a) * width * 0.5))
    }
    return [out]
  }

  const shapes: Vec2[][] = []
  for (const g of path.sampleGroups(2.0)) {
    const w0 = isMarker ? options.stroke_width : strokeWidthAt(g.sp, options)
    const w1 = isMarker ? options.stroke_width : strokeWidthAt(g.ep, options)
    shapes.push(composeLinesVariableWidth(g.lines, w0, w1))
  }
  return shapes
}

// Lossless vector SVG for a smooth brush: filled variable-width subpaths.
// Desktop PenPath rendering ignores line_style; dashes apply to shapes only.
export function brushStrokeSVG(
  path: PenPath,
  options: SmoothOptions,
  colorHex: string,
  opts: { marker?: boolean } = {}
): string {
  const rr = (v: number) => Math.round(v * 100) / 100
  const polys = brushOutlines(path, options, opts.marker === true)
  const subpaths = polys
    .filter((poly) => poly.length >= 3)
    .map((poly) => `M ${poly.map((p) => `${rr(p.x)},${rr(p.y)}`).join(' L ')} Z`)
  return subpaths.length ? `<path d="${subpaths.join(' ')}" fill="${colorHex}" stroke="none"/>` : ''
}
