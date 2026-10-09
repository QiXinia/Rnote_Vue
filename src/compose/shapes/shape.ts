// Port of rnote-compose shapes. Every shape knows how to render to a
// Canvas2D context, serialize to SVG, compute bounds and be transformed /
// hit-tested. Composite builders (grid, coordinate systems) produce groups of
// these primitives, mirroring rnote's builder -> ShapeStroke conversion.

import { Vec2, Aabb, Transform, cubicBezier } from '../geometry'
import {
  SmoothOptions,
  RoughOptions,
  LineCap,
  LineStyle,
  pietDashVector,
  FillStyle
} from '../style/options'
import { applyRoughShape, roughSVG } from '../style/rough'

export type ShapeKind =
  | 'line'
  | 'arrow'
  | 'rectangle'
  | 'ellipse'
  | 'polygon'
  | 'polyline'
  | 'quadbez'
  | 'cubbez'

export interface ShapeStyle {
  stroke: SmoothOptions
  rough: RoughOptions
  roughEnabled: boolean
}

export abstract class Shape {
  abstract kind: ShapeKind
  abstract bounds(): Aabb
  abstract translate(d: Vec2): void
  abstract transform(t: Transform): void
  abstract hitTest(p: Vec2, tolerance: number): boolean
  abstract draw(ctx: CanvasRenderingContext2D, style: ShapeStyle): void
  abstract toSVG(style: ShapeStyle): string
  abstract toJSON(): any
  abstract clone(): Shape

  // shared style application helper
  protected applyStroke(ctx: CanvasRenderingContext2D, s: SmoothOptions) {
    if (s.stroke_color) {
      ctx.strokeStyle = s.stroke_color.toCss()
      ctx.lineWidth = s.stroke_width
      ctx.lineJoin = 'round'
      const effectiveCap = s.line_style === LineStyle.Dotted ? LineCap.Rounded : s.line_cap
      ctx.lineCap = effectiveCap === LineCap.Rounded ? 'round' : 'butt'
      ctx.setLineDash(pietDashVector(s.line_style, s.stroke_width, effectiveCap))
    } else {
      ctx.strokeStyle = 'transparent'
    }
  }

  protected applyFill(ctx: CanvasRenderingContext2D, s: SmoothOptions) {
    ctx.fillStyle = s.fill_color ? s.fill_color.toCss() : 'transparent'
  }

  protected strokeSVGAttrs(s: SmoothOptions): string {
    const color = s.stroke_color ? s.stroke_color.toHex() : 'none'
    const effectiveCap = s.line_style === LineStyle.Dotted ? LineCap.Rounded : s.line_cap
    let attrs = `stroke="${color}" stroke-width="${round2(s.stroke_width)}" fill="none"`
    attrs += ` stroke-linecap="${effectiveCap === LineCap.Rounded ? 'round' : 'butt'}" stroke-linejoin="round"`
    const dash = pietDashVector(s.line_style, s.stroke_width, effectiveCap)
    if (dash.length) {
      attrs += ` stroke-dasharray="${dash.map((d) => round2(d)).join(' ')}"`
    }
    return attrs
  }

  protected fillSVGAttr(s: SmoothOptions): string {
    return s.fill_color ? s.fill_color.toHex() : 'none'
  }

  protected drawOrRough(ctx: CanvasRenderingContext2D, s: ShapeStyle, drawSmooth: () => void) {
    if (s.roughEnabled) {
      applyRoughShape(ctx, this, s.rough)
    } else {
      drawSmooth()
    }
  }
}

// ---------------- Line ----------------
export class LineShape extends Shape {
  kind: ShapeKind = 'line'
  start: Vec2
  end: Vec2

  constructor(start: Vec2, end: Vec2) {
    super()
    this.start = start
    this.end = end
  }
  bounds(): Aabb {
    return Aabb.new(this.start, this.end)
  }
  translate(d: Vec2) {
    this.start = this.start.add(d)
    this.end = this.end.add(d)
  }
  transform(t: Transform) {
    this.start = t.transformPoint(this.start)
    this.end = t.transformPoint(this.end)
  }
  hitTest(p: Vec2, tol: number): boolean {
    return distPointSegment(p, this.start, this.end) <= tol
  }
  draw(ctx: CanvasRenderingContext2D, style: ShapeStyle) {
    this.drawOrRough(ctx, style, () => {
      const s = style.stroke
      this.applyStroke(ctx, s)
      ctx.beginPath()
      ctx.moveTo(this.start.x, this.start.y)
      ctx.lineTo(this.end.x, this.end.y)
      ctx.stroke()
    })
  }
  toSVG(style: ShapeStyle): string {
    if (style.roughEnabled) return roughSVG(this, style.rough)
    return `<line x1="${r(this.start.x)}" y1="${r(this.start.y)}" x2="${r(this.end.x)}" y2="${r(this.end.y)}" ${this.strokeSVGAttrs(style.stroke)}/>`
  }
  toJSON() {
    return { kind: this.kind, start: pt(this.start), end: pt(this.end) }
  }
  clone(): Shape {
    return new LineShape(this.start.clone(), this.end.clone())
  }
}

// ---------------- Arrow ----------------
export enum ArrowHeadStyle {
  None = 'none',
  Triangle = 'triangle',
  Open = 'open'
}
export class ArrowShape extends Shape {
  kind: ShapeKind = 'arrow'
  start: Vec2
  end: Vec2
  head: ArrowHeadStyle = ArrowHeadStyle.Triangle
  tail: ArrowHeadStyle = ArrowHeadStyle.None
  headSize = 10

  constructor(start: Vec2, end: Vec2) {
    super()
    this.start = start
    this.end = end
  }
  private stemDir(): Vec2 {
    const v = this.end.sub(this.start)
    return v.length() === 0 ? new Vec2(1, 0) : v.normalize()
  }

  // Rust Arrow::compute_tip_lines_length: 10 * (1 + 0.18 * stroke_width).
  private tipLength(strokeWidth: number | null): number {
    return this.headSize * (1 + 0.18 * (strokeWidth ?? 0))
  }

  // Rust Arrow::internal_compute_bounds over [lline, rline, start, tip].
  private internalBounds(strokeWidth: number | null): Aabb {
    const wingAngle = (13 * Math.PI) / 16
    const dir = this.stemDir()
    const angle = Math.atan2(dir.y, dir.x)
    const len = this.tipLength(strokeWidth)
    const lline = new Vec2(
      this.end.x + Math.cos(angle + wingAngle) * len,
      this.end.y + Math.sin(angle + wingAngle) * len
    )
    const rline = new Vec2(
      this.end.x + Math.cos(angle - wingAngle) * len,
      this.end.y + Math.sin(angle - wingAngle) * len
    )
    return Aabb.fromPoints([this.start, this.end, lline, rline])
  }

  bounds(): Aabb {
    return this.internalBounds(0)
  }

  // Smooth Composer: internal bounds with width-adjusted tip, loosened(width).
  composedBounds(strokeWidth: number): Aabb {
    return this.internalBounds(strokeWidth).extend_by(strokeWidth)
  }
  translate(d: Vec2) {
    this.start = this.start.add(d)
    this.end = this.end.add(d)
  }
  transform(t: Transform) {
    this.start = t.transformPoint(this.start)
    this.end = t.transformPoint(this.end)
  }
  hitTest(p: Vec2, tol: number): boolean {
    return distPointSegment(p, this.start, this.end) <= tol
  }
  private drawHead(ctx: CanvasRenderingContext2D, at: Vec2, dir: Vec2, style: ArrowHeadStyle, s: { width: number; color: string }) {
    const angle = Math.atan2(dir.y, dir.x)
    // Rnote Arrow::TIP_LINES_STEM_OBTUSE_ANGLE = 13π/16.
    const wingAngle = (13 * Math.PI) / 16
    const size = this.headSize * (1 + 0.18 * s.width)
    const base = at.sub(dir.mul(size))
    if (style === ArrowHeadStyle.Open) {
      const a1 = angle - wingAngle
      const a2 = angle + wingAngle
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.width
      ctx.beginPath()
      ctx.moveTo(at.x + Math.cos(a1) * size, at.y + Math.sin(a1) * size)
      ctx.lineTo(at.x, at.y)
      ctx.lineTo(at.x + Math.cos(a2) * size, at.y + Math.sin(a2) * size)
      ctx.stroke()
    } else if (style === ArrowHeadStyle.Triangle) {
      const a1 = angle - wingAngle
      const a2 = angle + wingAngle
      ctx.fillStyle = s.color
      ctx.beginPath()
      ctx.moveTo(at.x, at.y)
      ctx.lineTo(at.x + Math.cos(a1) * size, at.y + Math.sin(a1) * size)
      ctx.lineTo(base.x, base.y)
      ctx.lineTo(at.x + Math.cos(a2) * size, at.y + Math.sin(a2) * size)
      ctx.closePath()
      ctx.fill()
    }
  }
  draw(ctx: CanvasRenderingContext2D, style: ShapeStyle) {
    const s = style.stroke
    this.applyStroke(ctx, s)
    const color = s.stroke_color ? s.stroke_color.toCss() : 'transparent'
    const dir = this.end.sub(this.start).normalize()
    let lineEnd = this.end
    let lineStart = this.start
    ctx.beginPath()
    ctx.moveTo(lineStart.x, lineStart.y)
    ctx.lineTo(lineEnd.x, lineEnd.y)
    ctx.stroke()
    if (this.head !== ArrowHeadStyle.None) this.drawHead(ctx, this.end, dir, this.head, { width: s.stroke_width, color })
    if (this.tail !== ArrowHeadStyle.None) this.drawHead(ctx, this.start, dir.neg(), this.tail, { width: s.stroke_width, color })
  }
  toSVG(style: ShapeStyle): string {
    const s = style.stroke
    const color = s.stroke_color ? s.stroke_color.toHex() : 'none'
    const size = this.headSize * (1 + 0.18 * s.stroke_width)
    const wingAngle = (13 * Math.PI) / 16
    const dir = this.end.sub(this.start).normalize()
    let out = `<line x1="${r(this.start.x)}" y1="${r(this.start.y)}" x2="${r(this.end.x)}" y2="${r(this.end.y)}" ${this.strokeSVGAttrs(s)}/>`
    const head = (at: Vec2, d: Vec2) => {
      const angle = Math.atan2(d.y, d.x)
      const p1 = `${r(at.x + Math.cos(angle - wingAngle) * size)},${r(at.y + Math.sin(angle - wingAngle) * size)}`
      const p2 = `${r(at.x + Math.cos(angle + wingAngle) * size)},${r(at.y + Math.sin(angle + wingAngle) * size)}`
      const tip = `${r(at.x)},${r(at.y)}`
      if (style.stroke.fill_color) {
        return `<polygon points="${tip} ${p1} ${p2}" fill="${style.stroke.fill_color.toHex()}"/>`
      }
      return `<polyline points="${p1} ${tip} ${p2}" fill="none" stroke="${color}" stroke-width="${r(s.stroke_width)}" stroke-linecap="round" stroke-linejoin="round"/>`
    }
    if (this.head !== ArrowHeadStyle.None) out += head(this.end, dir)
    if (this.tail !== ArrowHeadStyle.None) out += head(this.start, dir.neg())
    return `<g>${out}</g>`
  }
  toJSON() {
    return { kind: this.kind, start: pt(this.start), end: pt(this.end), head: this.head, tail: this.tail }
  }
  clone(): Shape {
    const a = new ArrowShape(this.start.clone(), this.end.clone())
    a.head = this.head
    a.tail = this.tail
    return a
  }
}

// ---------------- Rectangle ----------------
export class RectangleShape extends Shape {
  kind: ShapeKind = 'rectangle'
  rect: Aabb
  cornerRadius = 0

  constructor(rect: Aabb) {
    super()
    this.rect = rect
  }
  bounds(): Aabb {
    return this.rect
  }
  translate(d: Vec2) {
    this.rect = this.rect.translate(d)
  }
  transform(t: Transform) {
    this.rect = this.rect.transform(t)
  }
  hitTest(p: Vec2, tol: number): boolean {
    const b = this.rect
    const inside = p.x >= b.min.x - tol && p.x <= b.max.x + tol && p.y >= b.min.y - tol && p.y <= b.max.y + tol
    if (!inside) return false
    const onBorder =
      p.x <= b.min.x + tol || p.x >= b.max.x - tol || p.y <= b.min.y + tol || p.y >= b.max.y - tol
    // Interior counts as a hit (filled shapes); outline-only shapes still
    // match via `onBorder`.
    return inside || onBorder
  }
  private path(ctx: CanvasRenderingContext2D) {
    const b = this.rect
    const rad = Math.min(this.cornerRadius, b.width() / 2, b.height() / 2)
    ctx.beginPath()
    if (rad > 0) {
      ctx.roundRect(b.min.x, b.min.y, b.width(), b.height(), rad)
    } else {
      ctx.rect(b.min.x, b.min.y, b.width(), b.height())
    }
  }
  draw(ctx: CanvasRenderingContext2D, style: ShapeStyle) {
    const s = style.stroke
    if (style.roughEnabled) {
      applyRoughShape(ctx, this, style.rough)
      return
    }
    this.applyFill(ctx, s)
    this.applyStroke(ctx, s)
    this.path(ctx)
    if (s.fill_color) ctx.fill()
    if (s.stroke_color) ctx.stroke()
  }
  toSVG(style: ShapeStyle): string {
    if (style.roughEnabled) return roughSVG(this, style.rough)
    const b = this.rect
    const fill = this.fillSVGAttr(style.stroke)
    return `<rect x="${r(b.min.x)}" y="${r(b.min.y)}" width="${r(b.width())}" height="${r(b.height())}" fill="${fill}" ${this.strokeSVGAttrs(style.stroke).replace('fill="none"', '')}/>`
  }
  toJSON() {
    return { kind: this.kind, rect: { min: pt(this.rect.min), max: pt(this.rect.max) }, cornerRadius: this.cornerRadius }
  }
  clone(): Shape {
    const r2 = new RectangleShape(this.rect.clone())
    r2.cornerRadius = this.cornerRadius
    return r2
  }
}

// ---------------- Ellipse ----------------
export class EllipseShape extends Shape {
  kind: ShapeKind = 'ellipse'
  center: Vec2
  radii: Vec2
  rotation = 0

  constructor(center: Vec2, radii: Vec2, rotation = 0) {
    super()
    this.center = center
    this.radii = radii
    this.rotation = rotation
  }
  static fromRect(rect: Aabb): EllipseShape {
    return new EllipseShape(rect.center(), rect.halfExtents(), 0)
  }
  bounds(): Aabb {
    const c = Math.abs(Math.cos(this.rotation))
    const s = Math.abs(Math.sin(this.rotation))
    const hx = this.radii.x * c + this.radii.y * s
    const hy = this.radii.x * s + this.radii.y * c
    return Aabb.fromHalfExtents(this.center, new Vec2(hx, hy))
  }
  translate(d: Vec2) {
    this.center = this.center.add(d)
  }
  transform(t: Transform) {
    this.center = t.transformPoint(this.center)
    const rx = t.transformVec(new Vec2(this.radii.x, 0)).length()
    const ry = t.transformVec(new Vec2(0, this.radii.y)).length()
    this.radii = new Vec2(rx, ry)
    this.rotation += t.rotation
  }
  hitTest(p: Vec2, tol: number): boolean {
    const d = p.sub(this.center).rotate(-this.rotation)
    const nx = d.x / Math.max(this.radii.x, 1e-6)
    const ny = d.y / Math.max(this.radii.y, 1e-6)
    const v = nx * nx + ny * ny
    return Math.abs(v - 1) <= tol / Math.min(this.radii.x, this.radii.y) + 0.05 || v < 1
  }
  private path(ctx: CanvasRenderingContext2D) {
    ctx.beginPath()
    ctx.ellipse(this.center.x, this.center.y, this.radii.x, this.radii.y, this.rotation, 0, Math.PI * 2)
  }
  draw(ctx: CanvasRenderingContext2D, style: ShapeStyle) {
    const s = style.stroke
    if (style.roughEnabled) {
      applyRoughShape(ctx, this, style.rough)
      return
    }
    this.applyFill(ctx, s)
    this.applyStroke(ctx, s)
    this.path(ctx)
    if (s.fill_color) ctx.fill()
    if (s.stroke_color) ctx.stroke()
  }
  toSVG(style: ShapeStyle): string {
    if (style.roughEnabled) return roughSVG(this, style.rough)
    const fill = this.fillSVGAttr(style.stroke)
    return `<ellipse cx="${r(this.center.x)}" cy="${r(this.center.y)}" rx="${r(this.radii.x)}" ry="${r(this.radii.y)}" transform="rotate(${r((this.rotation * 180) / Math.PI)} ${r(this.center.x)} ${r(this.center.y)})" fill="${fill}" ${this.strokeSVGAttrs(style.stroke).replace('fill="none"', '')}/>`
  }
  toJSON() {
    return { kind: this.kind, center: pt(this.center), radii: pt(this.radii), rotation: this.rotation }
  }
  clone(): Shape {
    return new EllipseShape(this.center.clone(), this.radii.clone(), this.rotation)
  }
}

// ---------------- Polygon / Polyline ----------------
export class PolygonShape extends Shape {
  kind: ShapeKind = 'polygon'
  points: Vec2[]
  closed: boolean

  constructor(points: Vec2[], closed = true) {
    super()
    this.points = points
    this.closed = closed
    if (closed) this.kind = 'polygon'
    else this.kind = 'polyline'
  }
  bounds(): Aabb {
    return Aabb.fromPoints(this.points)
  }
  translate(d: Vec2) {
    this.points = this.points.map((p) => p.add(d))
  }
  transform(t: Transform) {
    this.points = this.points.map((p) => t.transformPoint(p))
  }
  hitTest(p: Vec2, tol: number): boolean {
    for (let i = 0; i < this.points.length - 1; i++) {
      if (distPointSegment(p, this.points[i], this.points[i + 1]) <= tol) return true
    }
    if (this.closed && this.points.length > 2) {
      if (distPointSegment(p, this.points[this.points.length - 1], this.points[0]) <= tol) return true
      return pointInPolygon(p, this.points)
    }
    return false
  }
  private path(ctx: CanvasRenderingContext2D) {
    ctx.beginPath()
    this.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    if (this.closed) ctx.closePath()
  }
  draw(ctx: CanvasRenderingContext2D, style: ShapeStyle) {
    const s = style.stroke
    if (style.roughEnabled) {
      applyRoughShape(ctx, this, style.rough)
      return
    }
    this.applyFill(ctx, s)
    this.applyStroke(ctx, s)
    this.path(ctx)
    if (this.closed && s.fill_color) ctx.fill()
    if (s.stroke_color) ctx.stroke()
  }
  toSVG(style: ShapeStyle): string {
    if (style.roughEnabled) return roughSVG(this, style.rough)
    const pts = this.points.map((p) => `${r(p.x)},${r(p.y)}`).join(' ')
    const el = this.closed ? 'polygon' : 'polyline'
    const fill = this.closed ? this.fillSVGAttr(style.stroke) : 'none'
    const attrs = this.strokeSVGAttrs(style.stroke).replace('fill="none"', `fill="${fill}"`)
    return `<${el} points="${pts}" ${attrs}/>`
  }
  toJSON() {
    return { kind: this.kind, points: this.points.map(pt), closed: this.closed }
  }
  clone(): Shape {
    return new PolygonShape(this.points.map((p) => p.clone()), this.closed)
  }
}

// ---------------- Quadratic Bezier ----------------
export class QuadBezShape extends Shape {
  kind: ShapeKind = 'quadbez'
  start: Vec2
  cp: Vec2
  end: Vec2

  constructor(start: Vec2, cp: Vec2, end: Vec2) {
    super()
    this.start = start
    this.cp = cp
    this.end = end
  }
  bounds(): Aabb {
    // approximate with control-point hull tightened by sampling
    const pts: Vec2[] = []
    for (let i = 0; i <= 24; i++) {
      const t = i / 24
      const mt = 1 - t
      pts.push(new Vec2(mt * mt * this.start.x + 2 * mt * t * this.cp.x + t * t * this.end.x, mt * mt * this.start.y + 2 * mt * t * this.cp.y + t * t * this.end.y))
    }
    return Aabb.fromPoints(pts)
  }
  translate(d: Vec2) {
    this.start = this.start.add(d)
    this.cp = this.cp.add(d)
    this.end = this.end.add(d)
  }
  transform(t: Transform) {
    this.start = t.transformPoint(this.start)
    this.cp = t.transformPoint(this.cp)
    this.end = t.transformPoint(this.end)
  }
  hitTest(p: Vec2, tol: number): boolean {
    let prev = this.start
    for (let i = 1; i <= 32; i++) {
      const t = i / 32
      const mt = 1 - t
      const cur = new Vec2(mt * mt * this.start.x + 2 * mt * t * this.cp.x + t * t * this.end.x, mt * mt * this.start.y + 2 * mt * t * this.cp.y + t * t * this.end.y)
      if (distPointSegment(p, prev, cur) <= tol) return true
      prev = cur
    }
    return false
  }
  private path(ctx: CanvasRenderingContext2D) {
    ctx.beginPath()
    ctx.moveTo(this.start.x, this.start.y)
    ctx.quadraticCurveTo(this.cp.x, this.cp.y, this.end.x, this.end.y)
  }
  draw(ctx: CanvasRenderingContext2D, style: ShapeStyle) {
    const s = style.stroke
    this.applyStroke(ctx, s)
    this.path(ctx)
    ctx.stroke()
  }
  toSVG(style: ShapeStyle): string {
    return `<path d="M ${r(this.start.x)} ${r(this.start.y)} Q ${r(this.cp.x)} ${r(this.cp.y)} ${r(this.end.x)} ${r(this.end.y)}" ${this.strokeSVGAttrs(style.stroke)}/>`
  }
  toJSON() {
    return { kind: this.kind, start: pt(this.start), cp: pt(this.cp), end: pt(this.end) }
  }
  clone(): Shape {
    return new QuadBezShape(this.start.clone(), this.cp.clone(), this.end.clone())
  }
}

// ---------------- Cubic Bezier ----------------
export class CubBezShape extends Shape {
  kind: ShapeKind = 'cubbez'
  start: Vec2
  cp1: Vec2
  cp2: Vec2
  end: Vec2

  constructor(start: Vec2, cp1: Vec2, cp2: Vec2, end: Vec2) {
    super()
    this.start = start
    this.cp1 = cp1
    this.cp2 = cp2
    this.end = end
  }
  pointAt(t: number): Vec2 {
    return new Vec2(
      cubicBezier(this.start.x, this.cp1.x, this.cp2.x, this.end.x, t),
      cubicBezier(this.start.y, this.cp1.y, this.cp2.y, this.end.y, t)
    )
  }
  bounds(): Aabb {
    const pts: Vec2[] = []
    for (let i = 0; i <= 32; i++) pts.push(this.pointAt(i / 32))
    return Aabb.fromPoints(pts)
  }
  translate(d: Vec2) {
    this.start = this.start.add(d)
    this.cp1 = this.cp1.add(d)
    this.cp2 = this.cp2.add(d)
    this.end = this.end.add(d)
  }
  transform(t: Transform) {
    this.start = t.transformPoint(this.start)
    this.cp1 = t.transformPoint(this.cp1)
    this.cp2 = t.transformPoint(this.cp2)
    this.end = t.transformPoint(this.end)
  }
  hitTest(p: Vec2, tol: number): boolean {
    let prev = this.start
    for (let i = 1; i <= 40; i++) {
      const cur = this.pointAt(i / 40)
      if (distPointSegment(p, prev, cur) <= tol) return true
      prev = cur
    }
    return false
  }
  private path(ctx: CanvasRenderingContext2D) {
    ctx.beginPath()
    ctx.moveTo(this.start.x, this.start.y)
    ctx.bezierCurveTo(this.cp1.x, this.cp1.y, this.cp2.x, this.cp2.y, this.end.x, this.end.y)
  }
  draw(ctx: CanvasRenderingContext2D, style: ShapeStyle) {
    const s = style.stroke
    this.applyStroke(ctx, s)
    this.path(ctx)
    ctx.stroke()
  }
  toSVG(style: ShapeStyle): string {
    return `<path d="M ${r(this.start.x)} ${r(this.start.y)} C ${r(this.cp1.x)} ${r(this.cp1.y)} ${r(this.cp2.x)} ${r(this.cp2.y)} ${r(this.end.x)} ${r(this.end.y)}" ${this.strokeSVGAttrs(style.stroke)}/>`
  }
  toJSON() {
    return { kind: this.kind, start: pt(this.start), cp1: pt(this.cp1), cp2: pt(this.cp2), end: pt(this.end) }
  }
  clone(): Shape {
    return new CubBezShape(this.start.clone(), this.cp1.clone(), this.cp2.clone(), this.end.clone())
  }
}

// ---------------- helpers ----------------
export function distPointSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = b.sub(a)
  const lenSq = ab.lengthSquared()
  if (lenSq < 1e-9) return p.distance(a)
  let t = p.sub(a).dot(ab) / lenSq
  t = Math.max(0, Math.min(1, t))
  return p.distance(a.add(ab.mul(t)))
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pt(p: Vec2) {
  return { x: round3(p.x), y: round3(p.y) }
}
export function vpt(o: any): Vec2 {
  return new Vec2(o.x, o.y)
}
function r(v: number): number {
  return Math.round(v * 100) / 100
}
function round2(v: number): number {
  return Math.round(v * 100) / 100
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

export function shapeFromJSON(o: any): Shape | null {
  if (!o) return null
  switch (o.kind) {
    case 'line':
      return new LineShape(vpt(o.start), vpt(o.end))
    case 'arrow': {
      const a = new ArrowShape(vpt(o.start), vpt(o.end))
      a.head = o.head ?? ArrowHeadStyle.Triangle
      a.tail = o.tail ?? ArrowHeadStyle.None
      return a
    }
    case 'rectangle':
      return new RectangleShape(new Aabb(vpt(o.rect.min), vpt(o.rect.max)))
    case 'ellipse':
      return new EllipseShape(vpt(o.center), vpt(o.radii), o.rotation ?? 0)
    case 'polygon':
    case 'polyline':
      return new PolygonShape((o.points ?? []).map(vpt), o.closed ?? o.kind === 'polygon')
    case 'quadbez':
      return new QuadBezShape(vpt(o.start), vpt(o.cp), vpt(o.end))
    case 'cubbez':
      return new CubBezShape(vpt(o.start), vpt(o.cp1), vpt(o.cp2), vpt(o.end))
    default:
      return null
  }
}

// Re-export for convenience
export { FillStyle, LineStyle, LineCap }
