// Port of rnote-compose geometry primitives (glam::Vec2 / p2d math).
// Lightweight 2D vector used everywhere in document coordinates.

export interface Vec2Like {
  x: number
  y: number
}

export class Vec2 {
  x: number
  y: number

  constructor(x = 0, y = 0) {
    this.x = x
    this.y = y
  }

  static splat(v: number): Vec2 {
    return new Vec2(v, v)
  }
  static get ZERO(): Vec2 {
    return new Vec2(0, 0)
  }
  static get UNIT_X(): Vec2 {
    return new Vec2(1, 0)
  }
  static get UNIT_Y(): Vec2 {
    return new Vec2(0, 1)
  }
  static get ONE(): Vec2 {
    return new Vec2(1, 1)
  }

  static from(v: Vec2Like | [number, number]): Vec2 {
    return Array.isArray(v) ? new Vec2(v[0], v[1]) : new Vec2(v.x, v.y)
  }

  clone(): Vec2 {
    return new Vec2(this.x, this.y)
  }
  copy(v: Vec2Like): this {
    this.x = v.x
    this.y = v.y
    return this
  }

  add(o: Vec2Like): Vec2 {
    return new Vec2(this.x + o.x, this.y + o.y)
  }
  sub(o: Vec2Like): Vec2 {
    return new Vec2(this.x - o.x, this.y - o.y)
  }
  mul(s: number | Vec2Like): Vec2 {
    return typeof s === 'number' ? new Vec2(this.x * s, this.y * s) : new Vec2(this.x * s.x, this.y * s.y)
  }
  div(s: number | Vec2Like): Vec2 {
    return typeof s === 'number' ? new Vec2(this.x / s, this.y / s) : new Vec2(this.x / s.x, this.y / s.y)
  }
  neg(): Vec2 {
    return new Vec2(-this.x, -this.y)
  }
  dot(o: Vec2Like): number {
    return this.x * o.x + this.y * o.y
  }
  perp(): Vec2 {
    // 90 degree rotation counter-clockwise: (x, y) -> (-y, x)
    return new Vec2(-this.y, this.x)
  }
  length(): number {
    return Math.hypot(this.x, this.y)
  }
  lengthSquared(): number {
    return this.x * this.x + this.y * this.y
  }
  distance(o: Vec2Like): number {
    return Math.hypot(this.x - o.x, this.y - o.y)
  }
  distanceSquared(o: Vec2Like): number {
    const dx = this.x - o.x
    const dy = this.y - o.y
    return dx * dx + dy * dy
  }
  normalize(): Vec2 {
    const l = this.length()
    return l > 1e-12 ? new Vec2(this.x / l, this.y / l) : new Vec2(0, 0)
  }
  tryNormalize(): Vec2 | null {
    const l = this.length()
    return l > 1e-12 ? new Vec2(this.x / l, this.y / l) : null
  }
  angle(): number {
    return Math.atan2(this.y, this.x)
  }
  rotate(angle: number): Vec2 {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c)
  }
  lerp(o: Vec2Like, t: number): Vec2 {
    return new Vec2(this.x + (o.x - this.x) * t, this.y + (o.y - this.y) * t)
  }
  floor(): Vec2 {
    return new Vec2(Math.floor(this.x), Math.floor(this.y))
  }
  ceil(): Vec2 {
    return new Vec2(Math.ceil(this.x), Math.ceil(this.y))
  }
  abs(): Vec2 {
    return new Vec2(Math.abs(this.x), Math.abs(this.y))
  }
  min(o: Vec2Like): Vec2 {
    return new Vec2(Math.min(this.x, o.x), Math.min(this.y, o.y))
  }
  max(o: Vec2Like): Vec2 {
    return new Vec2(Math.max(this.x, o.x), Math.max(this.y, o.y))
  }
  clamp(min: Vec2Like, max: Vec2Like): Vec2 {
    return new Vec2(Math.min(max.x, Math.max(min.x, this.x)), Math.min(max.y, Math.max(min.y, this.y)))
  }
  angleTo(o: Vec2Like): number {
    return Math.atan2(o.y - this.y, o.x - this.x)
  }
  equals(o: Vec2Like, eps = 1e-9): boolean {
    return Math.abs(this.x - o.x) <= eps && Math.abs(this.y - o.y) <= eps
  }
  toArray(): [number, number] {
    return [this.x, this.y]
  }
}

export const vec2 = (x = 0, y = 0): Vec2 => new Vec2(x, y)
