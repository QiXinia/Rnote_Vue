// A compact rough.js-style renderer (ports the visual result of rnote's
// rough-rs backend). Produces two wobbly passes over each skeleton path, plus
// hachure / solid fills, driven by a seeded RNG so re-renders are stable.

import { Vec2, Aabb, mulberry32 } from '../geometry'
import { RoughOptions, FillStyle, LineCap, lineDashVector } from './options'
import {
  Shape,
  LineShape,
  ArrowShape,
  RectangleShape,
  EllipseShape,
  PolygonShape,
  QuadBezShape,
  CubBezShape
} from '../shapes/shape'

function rngFor(o: RoughOptions): () => number {
  return mulberry32(o.seed ?? 12345)
}

// Offset a line midpoint perpendicular to itself (rough "bowing").
function roughLinePoints(a: Vec2, b: Vec2, rng: () => number, roughness: number, bowing: number): Vec2[] {
  const dist = a.distance(b)
  const bow = Math.min(bowing, dist / 50) * (rng() - 0.5)
  const normal = b.sub(a).normalize().perp().mul(bow * dist * 0.01 * roughness)
  const mid = a.lerp(b, 0.5)
  const m = mid.add(normal)
  const j = () => (rng() - 0.5) * roughness
  return [
    new Vec2(a.x + j(), a.y + j()),
    new Vec2(m.x + j() * 0.6, m.y + j() * 0.6),
    new Vec2(b.x + j(), b.y + j())
  ]
}

function tracePolyline(ctx: CanvasRenderingContext2D, pts: Vec2[]) {
  ctx.beginPath()
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.stroke()
}

function setRoughStroke(ctx: CanvasRenderingContext2D, o: RoughOptions) {
  ctx.strokeStyle = o.stroke_color ? o.stroke_color.toCss() : 'transparent'
  ctx.lineWidth = o.stroke_width
  ctx.lineJoin = 'round'
  ctx.lineCap = o.line_cap === LineCap.Rounded ? 'round' : 'butt'
  const dash = lineDashVector(o.line_style)
  ctx.setLineDash(dash.length ? dash.map((d) => (d === 0 ? o.stroke_width : d * o.stroke_width * Math.E)) : [])
}

function sampleEllipse(center: Vec2, radii: Vec2, rotation: number, segments = 32): Vec2[] {
  const pts: Vec2[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push(new Vec2(Math.cos(a) * radii.x, Math.sin(a) * radii.y).rotate(rotation).add(center))
  }
  return pts
}

function jitterClosed(pts: Vec2[], rng: () => number, amount: number, passes: number): Vec2[][] {
  const out: Vec2[][] = []
  for (let p = 0; p < passes; p++) {
    out.push(
      pts.map((pt) => {
        if (pt === pts[0] || pt === pts[pts.length - 1]) return pt.clone()
        return pt.add(new Vec2((rng() - 0.5) * amount, (rng() - 0.5) * amount))
      })
    )
  }
  return out
}

// hachure lines clipped to a closed polygon, at a given angle.
function hachureLines(poly: Vec2[], bounds: Aabb, angle: number, gap: number): [Vec2, Vec2][] {
  const lines: [Vec2, Vec2][] = []
  const center = bounds.center()
  const radius = bounds.diagonal() / 2 + gap
  const dir = new Vec2(Math.cos(angle), Math.sin(angle))
  const perp = dir.perp()
  const steps = Math.ceil((radius * 2) / gap)
  for (let i = -steps; i <= steps; i++) {
    const offset = i * gap
    const mid = center.add(perp.mul(offset))
    const p1 = mid.add(dir.mul(-radius))
    const p2 = mid.add(dir.mul(radius))
    const pts = clipLinePolygon(p1, p2, poly)
    if (pts) lines.push(pts)
  }
  return lines
}

// Liang-Barsky-ish clipping of a line against a convex/concave polygon via
// segment-polygon intersection collection.
function clipLinePolygon(a: Vec2, b: Vec2, poly: Vec2[]): [Vec2, Vec2] | null {
  const hits: number[] = []
  const ab = b.sub(a)
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i]
    const d = poly[(i + 1) % poly.length]
    const t = lineIntersectionParam(a, b, c, d)
    if (t !== null && t >= 0 && t <= 1) hits.push(t)
  }
  // include endpoints if inside
  if (pointInPoly(a, poly)) hits.push(0)
  if (pointInPoly(b, poly)) hits.push(1)
  if (hits.length < 2) return null
  hits.sort((x, y) => x - y)
  const t0 = hits[0]
  const t1 = hits[hits.length - 1]
  if (t1 - t0 < 1e-4) return null
  return [a.add(ab.mul(t0)), a.add(ab.mul(t1))]
}

function lineIntersectionParam(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number | null {
  const r = b.sub(a)
  const s = d.sub(c)
  const denom = r.x * s.y - r.y * s.x
  if (Math.abs(denom) < 1e-9) return null
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denom
  return u >= 0 && u <= 1 ? t : null
}

function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function closedPolygonOf(shape: Shape): Vec2[] | null {
  if (shape instanceof RectangleShape) return shape.rect.vertices()
  if (shape instanceof EllipseShape) return sampleEllipse(shape.center, shape.radii, shape.rotation, 48)
  if (shape instanceof PolygonShape && shape.closed) return shape.points
  return null
}

function hachurePass(
  ctx: CanvasRenderingContext2D,
  poly: Vec2[],
  angle: number,
  o: RoughOptions,
  rng: () => number
) {
  const bounds = Aabb.fromPoints(poly)
  const gap = Math.max(4, o.stroke_width * 3)
  const lines = hachureLines(poly, bounds, angle, gap)
  ctx.beginPath()
  for (const [p1, p2] of lines) {
    const j = () => (rng() - 0.5) * o.roughness
    ctx.moveTo(p1.x + j(), p1.y + j())
    ctx.lineTo(p2.x + j(), p2.y + j())
  }
  ctx.stroke()
}

function drawHachure(ctx: CanvasRenderingContext2D, shape: Shape, o: RoughOptions, rng: () => number) {
  const poly = closedPolygonOf(shape)
  if (!poly || !o.fill_color) return
  ctx.strokeStyle = o.fill_color.toCss()
  ctx.lineWidth = Math.max(1, o.stroke_width * 0.8)
  ctx.setLineDash([])
  // zig-zag / dots / dashed fills approximate to a single hachure pass;
  // crosshatch adds a second pass at 90°.
  hachurePass(ctx, poly, o.hachure_angle, o, rng)
  if (o.fill_style === FillStyle.Crosshatch) {
    hachurePass(ctx, poly, o.hachure_angle + Math.PI / 2, o, rng)
  }
}

function drawSolidFill(ctx: CanvasRenderingContext2D, shape: Shape, o: RoughOptions) {
  if (!o.fill_color) return
  ctx.fillStyle = o.fill_color.toCss()
  ctx.beginPath()
  if (shape instanceof RectangleShape) {
    ctx.rect(shape.rect.min.x, shape.rect.min.y, shape.rect.width(), shape.rect.height())
  } else if (shape instanceof EllipseShape) {
    ctx.ellipse(shape.center.x, shape.center.y, shape.radii.x, shape.radii.y, shape.rotation, 0, Math.PI * 2)
  } else if (shape instanceof PolygonShape && shape.closed) {
    shape.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.closePath()
  }
  ctx.fill()
}

function drawArrowHead(ctx: CanvasRenderingContext2D, shape: ArrowShape, o: RoughOptions) {
  const color = o.stroke_color
  if (!color) return
  const size = Math.max(16, o.stroke_width * 4)
  const dir = shape.end.sub(shape.start).normalize()
  const head = (at: Vec2, d: Vec2) => {
    const angle = Math.atan2(d.y, d.x)
    const base = at.sub(d.mul(size))
    ctx.fillStyle = color.toCss()
    ctx.beginPath()
    ctx.moveTo(at.x, at.y)
    ctx.lineTo(base.x + Math.cos(angle - Math.PI / 7) * size, base.y + Math.sin(angle - Math.PI / 7) * size)
    ctx.lineTo(base.x + Math.cos(angle + Math.PI / 7) * size, base.y + Math.sin(angle + Math.PI / 7) * size)
    ctx.closePath()
    ctx.fill()
  }
  head(shape.end, dir)
}

export function applyRoughShape(ctx: CanvasRenderingContext2D, shape: Shape, o: RoughOptions) {
  const rng = rngFor(o)
  const passes = Math.max(1, Math.round(o.stroke_count))
  const roughness = o.roughness * 1.5

  if (o.fill_color) {
    if (o.fill_style === FillStyle.Solid) drawSolidFill(ctx, shape, o)
    else drawHachure(ctx, shape, o, rng)
  }

  setRoughStroke(ctx, o)

  const strokeOpen = (pts: Vec2[]) => {
    for (let pass = 0; pass < passes; pass++) {
      const jittered = pts.map((p) => p.add(new Vec2((rng() - 0.5) * roughness, (rng() - 0.5) * roughness)))
      tracePolyline(ctx, jittered)
    }
  }

  if (shape instanceof LineShape) {
    for (let pass = 0; pass < passes; pass++) tracePolyline(ctx, roughLinePoints(shape.start, shape.end, rng, roughness, o.bowing))
  } else if (shape instanceof ArrowShape) {
    for (let pass = 0; pass < passes; pass++) tracePolyline(ctx, roughLinePoints(shape.start, shape.end, rng, roughness, o.bowing))
    drawArrowHead(ctx, shape, o)
  } else if (shape instanceof RectangleShape) {
    const v = shape.rect.vertices()
    for (let i = 0; i < 4; i++) {
      for (let pass = 0; pass < passes; pass++) tracePolyline(ctx, roughLinePoints(v[i], v[(i + 1) % 4], rng, roughness, o.bowing))
    }
  } else if (shape instanceof EllipseShape) {
    const base = sampleEllipse(shape.center, shape.radii, shape.rotation, 36)
    for (const pass of jitterClosed(base, rng, roughness, passes)) {
      ctx.beginPath()
      pass.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.closePath()
      ctx.stroke()
    }
  } else if (shape instanceof PolygonShape) {
    const n = shape.points.length
    const edges = shape.closed ? n : n - 1
    for (let i = 0; i < edges; i++) {
      for (let pass = 0; pass < passes; pass++) tracePolyline(ctx, roughLinePoints(shape.points[i], shape.points[(i + 1) % n], rng, roughness, o.bowing))
    }
  } else if (shape instanceof QuadBezShape) {
    const pts: Vec2[] = []
    for (let i = 0; i <= 30; i++) {
      const t = i / 30
      const mt = 1 - t
      pts.push(new Vec2(mt * mt * shape.start.x + 2 * mt * t * shape.cp.x + t * t * shape.end.x, mt * mt * shape.start.y + 2 * mt * t * shape.cp.y + t * t * shape.end.y))
    }
    strokeOpen(pts)
  } else if (shape instanceof CubBezShape) {
    const pts: Vec2[] = []
    for (let i = 0; i <= 36; i++) pts.push(shape.pointAt(i / 36))
    strokeOpen(pts)
  }
}

// ---------------- SVG variant ----------------
export function roughSVG(shape: Shape, o: RoughOptions): string {
  const rng = rngFor(o)
  const passes = Math.max(1, Math.round(o.stroke_count))
  const roughness = o.roughness * 1.5
  const color = o.stroke_color ? o.stroke_color.toHex() : 'none'
  const strokeAttr = `stroke="${color}" stroke-width="${o.stroke_width}" fill="none" stroke-linecap="round" stroke-linejoin="round"`
  let paths = ''

  const polyPath = (pts: Vec2[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${r(p.x)} ${r(p.y)}`).join(' ')

  if (o.fill_color && o.fill_style === FillStyle.Solid) {
    const poly = closedPolygonOf(shape)
    if (poly) paths += `<polygon points="${poly.map((p) => `${r(p.x)},${r(p.y)}`).join(' ')}" fill="${o.fill_color.toHex()}" stroke="none"/>`
  } else if (o.fill_color && o.fill_style !== FillStyle.None) {
    // any patterned fill (hachure / zig-zag / dots / dashed) renders as
    // hachure; crosshatch adds a perpendicular second pass
    const poly = closedPolygonOf(shape)
    if (poly) {
      const gap = Math.max(4, o.stroke_width * 3)
      const angles =
        o.fill_style === FillStyle.Crosshatch
          ? [o.hachure_angle, o.hachure_angle + Math.PI / 2]
          : [o.hachure_angle]
      for (const angle of angles) {
        const lines = hachureLines(poly, Aabb.fromPoints(poly), angle, gap)
        let d = ''
        for (const [p1, p2] of lines) d += `M${r(p1.x)} ${r(p1.y)} L${r(p2.x)} ${r(p2.y)} `
        paths += `<path d="${d}" stroke="${o.fill_color.toHex()}" stroke-width="${Math.max(1, o.stroke_width * 0.8)}" fill="none"/>`
      }
    }
  }

  const addLine = (a: Vec2, b: Vec2) => {
    for (let pass = 0; pass < passes; pass++) {
      paths += `<path d="${polyPath(roughLinePoints(a, b, rng, roughness, o.bowing))}" ${strokeAttr}/>`
    }
  }

  if (shape instanceof LineShape) {
    addLine(shape.start, shape.end)
  } else if (shape instanceof ArrowShape) {
    addLine(shape.start, shape.end)
    const size = Math.max(16, o.stroke_width * 4)
    const dir = shape.end.sub(shape.start).normalize()
    const base = shape.end.sub(dir.mul(size))
    const ang = Math.atan2(dir.y, dir.x)
    paths += `<polygon points="${r(shape.end.x)},${r(shape.end.y)} ${r(base.x + Math.cos(ang - Math.PI / 7) * size)},${r(base.y + Math.sin(ang - Math.PI / 7) * size)} ${r(base.x + Math.cos(ang + Math.PI / 7) * size)},${r(base.y + Math.sin(ang + Math.PI / 7) * size)}" fill="${color}"/>`
  } else if (shape instanceof RectangleShape) {
    const v = shape.rect.vertices()
    for (let i = 0; i < 4; i++) addLine(v[i], v[(i + 1) % 4])
  } else if (shape instanceof EllipseShape) {
    const base = sampleEllipse(shape.center, shape.radii, shape.rotation, 36)
    for (const pass of jitterClosed(base, rng, roughness, passes)) paths += `<polygon points="${pass.map((p) => `${r(p.x)},${r(p.y)}`).join(' ')}" ${strokeAttr}/>`
  } else if (shape instanceof PolygonShape) {
    const n = shape.points.length
    const edges = shape.closed ? n : n - 1
    for (let i = 0; i < edges; i++) addLine(shape.points[i], shape.points[(i + 1) % n])
  } else if (shape instanceof QuadBezShape || shape instanceof CubBezShape) {
    const pts = shape instanceof CubBezShape ? Array.from({ length: 37 }, (_, i) => (shape as CubBezShape).pointAt(i / 36)) : (() => {
      const s = shape as QuadBezShape
      const out: Vec2[] = []
      for (let i = 0; i <= 30; i++) {
        const t = i / 30
        const mt = 1 - t
        out.push(new Vec2(mt * mt * s.start.x + 2 * mt * t * s.cp.x + t * t * s.end.x, mt * mt * s.start.y + 2 * mt * t * s.cp.y + t * t * s.end.y))
      }
      return out
    })()
    for (let pass = 0; pass < passes; pass++) {
      const j = pts.map((p) => p.add(new Vec2((rng() - 0.5) * roughness, (rng() - 0.5) * roughness)))
      paths += `<path d="${polyPath(j)}" ${strokeAttr}/>`
    }
  }
  return `<g>${paths}</g>`
}

function r(v: number): number {
  return Math.round(v * 100) / 100
}
