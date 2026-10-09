// Port of rnote-compose Aabb (p2d::bounding_volume::Aabb).

import { Transform } from './transform'
import { Vec2 } from './vec2'

export class Aabb {
  min: Vec2
  max: Vec2

  constructor(min: Vec2 = new Vec2(0, 0), max: Vec2 = new Vec2(0, 0)) {
    this.min = min
    this.max = max
  }

  static new(pos1: Vec2, pos2: Vec2): Aabb {
    return new Aabb(
      new Vec2(Math.min(pos1.x, pos2.x), Math.min(pos1.y, pos2.y)),
      new Vec2(Math.max(pos1.x, pos2.x), Math.max(pos1.y, pos2.y))
    )
  }

  static fromHalfExtents(center: Vec2, halfExtents: Vec2): Aabb {
    return new Aabb(center.sub(halfExtents), center.add(halfExtents))
  }

  static fromPoints(points: Vec2[]): Aabb {
    if (points.length === 0) return new Aabb()
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of points) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    return new Aabb(new Vec2(minX, minY), new Vec2(maxX, maxY))
  }

  clone(): Aabb {
    return new Aabb(this.min.clone(), this.max.clone())
  }

  zero(): boolean {
    return this.max.x <= this.min.x && this.max.y <= this.min.y
  }

  center(): Vec2 {
    return this.min.add(this.max).mul(0.5)
  }
  halfExtents(): Vec2 {
    return this.max.sub(this.min).mul(0.5)
  }
  extents(): Vec2 {
    return this.max.sub(this.min)
  }
  width(): number {
    return this.max.x - this.min.x
  }
  height(): number {
    return this.max.y - this.min.y
  }
  diagonal(): number {
    return this.max.sub(this.min).length()
  }

  contains(p: Vec2): boolean {
    return p.x >= this.min.x && p.x <= this.max.x && p.y >= this.min.y && p.y <= this.max.y
  }

  intersects(other: Aabb): boolean {
    return (
      this.min.x <= other.max.x &&
      this.max.x >= other.min.x &&
      this.min.y <= other.max.y &&
      this.max.y >= other.min.y
    )
  }

  intersection(other: Aabb): Aabb | null {
    const min = this.min.max(other.min)
    const max = this.max.min(other.max)
    if (min.x > max.x || min.y > max.y) return null
    return new Aabb(min, max)
  }

  includes(other: Aabb): boolean {
    return (
      this.min.x <= other.min.x &&
      this.min.y <= other.min.y &&
      this.max.x >= other.max.x &&
      this.max.y >= other.max.y
    )
  }

  extend_by(v: number): Aabb {
    return new Aabb(this.min.sub(new Vec2(v, v)), this.max.add(new Vec2(v, v)))
  }

  union(other: Aabb): Aabb {
    if (this.zero()) return other.clone()
    if (other.zero()) return this.clone()
    return new Aabb(this.min.min(other.min), this.max.max(other.max))
  }

  scale(scale: Vec2, center: Vec2 = this.center()): Aabb {
    const t = Transform.scaleVec(scale, center)
    return this.transform(t)
  }

  transform(t: Transform): Aabb {
    const corners = [
      t.transformPoint(this.min),
      t.transformPoint(new Vec2(this.min.x, this.max.y)),
      t.transformPoint(this.max),
      t.transformPoint(new Vec2(this.max.x, this.min.y))
    ]
    return Aabb.fromPoints(corners)
  }

  translate(v: Vec2): Aabb {
    return new Aabb(this.min.add(v), this.max.add(v))
  }

  looses(margin: number): Aabb {
    return this.extend_by(margin)
  }

  split_at(offset: Vec2): [Aabb, Aabb] {
    // splits along x / y where offset component != 0
    let first = this.clone()
    let second = this.clone()
    if (offset.x !== 0) {
      const splitX = this.center().x + offset.x
      first = new Aabb(this.min.clone(), new Vec2(splitX, this.max.y))
      second = new Aabb(new Vec2(splitX, this.min.y), this.max.clone())
    }
    if (offset.y !== 0) {
      const splitY = this.center().y + offset.y
      first = new Aabb(first.min.clone(), new Vec2(first.max.x, splitY))
      second = new Aabb(new Vec2(second.min.x, splitY), second.max.clone())
    }
    return [first, second]
  }

  vertices(): Vec2[] {
    return [
      this.min.clone(),
      new Vec2(this.min.x, this.max.y),
      this.max.clone(),
      new Vec2(this.max.x, this.min.y)
    ]
  }
}
