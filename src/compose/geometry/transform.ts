// Port of rnote-compose Transform (nalgebra Affine2, column-major 2x3 matrix).
// Stored as canvas-style [a, b, c, d, e, f]:
//   | a c e |
//   | b d f |
// point: (a*x + c*y + e, b*x + d*y + f)

import { Vec2 } from './vec2'

export class Transform {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number

  constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
    this.a = a
    this.b = b
    this.c = c
    this.d = d
    this.e = e
    this.f = f
  }

  static identity(): Transform {
    return new Transform()
  }

  static new(a: number, b: number, c: number, d: number, e: number, f: number): Transform {
    return new Transform(a, b, c, d, e, f)
  }

  static wrap(mat: number[]): Transform {
    return new Transform(mat[0], mat[1], mat[2], mat[3], mat[4], mat[5])
  }

  clone(): Transform {
    return new Transform(this.a, this.b, this.c, this.d, this.e, this.f)
  }

  static translation(x: number, y: number): Transform {
    return new Transform(1, 0, 0, 1, x, y)
  }
  static translationVec(v: Vec2): Transform {
    return Transform.translation(v.x, v.y)
  }

  static rotation(angle: number, center: Vec2 = new Vec2(0, 0)): Transform {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    // R around center: T(center) * R * T(-center)
    const e = center.x - c * center.x + s * center.y
    const f = center.y - s * center.x - c * center.y
    return new Transform(c, s, -s, c, e, f)
  }

  static scale(x: number, y: number, center: Vec2 = new Vec2(0, 0)): Transform {
    return new Transform(x, 0, 0, y, center.x - x * center.x, center.y - y * center.y)
  }
  static scaleVec(s: Vec2, center: Vec2 = new Vec2(0, 0)): Transform {
    return Transform.scale(s.x, s.y, center)
  }

  static newTranslateRotateScale(translation: Vec2, rotation: number, scale: Vec2): Transform {
    const t = Transform.translationVec(translation)
    const r = Transform.rotation(rotation)
    const s = Transform.scaleVec(scale)
    return t.append(r).append(s)
  }

  // this * other  (apply `other` first, then `this`)
  append(other: Transform): Transform {
    const A = this
    const B = other
    return new Transform(
      A.a * B.a + A.c * B.b,
      A.b * B.a + A.d * B.b,
      A.a * B.c + A.c * B.d,
      A.b * B.c + A.d * B.d,
      A.a * B.e + A.c * B.f + A.e,
      A.b * B.e + A.d * B.f + A.f
    )
  }

  prepend(other: Transform): Transform {
    return other.append(this)
  }

  transformPoint(p: Vec2): Vec2 {
    return new Vec2(this.a * p.x + this.c * p.y + this.e, this.b * p.x + this.d * p.y + this.f)
  }

  transformVec(v: Vec2): Vec2 {
    // direction vector (no translation)
    return new Vec2(this.a * v.x + this.c * v.y, this.b * v.x + this.d * v.y)
  }

  inverse(): Transform {
    const det = this.a * this.d - this.b * this.c
    const inv = 1 / det
    const a = this.d * inv
    const b = -this.b * inv
    const c = -this.c * inv
    const d = this.a * inv
    const e = (this.c * this.f - this.d * this.e) * inv
    const f = (this.b * this.e - this.a * this.f) * inv
    return new Transform(a, b, c, d, e, f)
  }

  get translation(): Vec2 {
    return new Vec2(this.e, this.f)
  }
  setTranslation(v: Vec2) {
    this.e = v.x
    this.f = v.y
  }

  get rotation(): number {
    return Math.atan2(this.b, this.a)
  }

  get scale(): Vec2 {
    return new Vec2(Math.hypot(this.a, this.b), Math.hypot(this.c, this.d))
  }

  determinant(): number {
    return this.a * this.d - this.b * this.c
  }

  toArray(): number[] {
    return [this.a, this.b, this.c, this.d, this.e, this.f]
  }

  // Canvas setTransform expects [a,b,c,d,e,f]
  applyToCtx(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(this.a, this.b, this.c, this.d, this.e, this.f)
  }
}
