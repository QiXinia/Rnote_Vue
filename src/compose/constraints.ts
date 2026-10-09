// Port of rnote-compose Constraints / ConstraintRatio / ConstraintEnabled.
// Used while dragging shapes to snap to horizontal / vertical / 1:1 etc.

import { Vec2 } from './geometry'

export enum ConstraintRatio {
  Horizontal = 'horizontal',
  Vertical = 'vertical',
  OneToOne = 'one_to_one',
  ThreeToTwo = 'three_to_two',
  Golden = 'golden'
}

export enum ConstraintDirection {
  Start = 'start',
  End = 'end',
  Center = 'center'
}

export class Constraints {
  enabled = true
  ratios: Set<ConstraintRatio> = new Set()
  direction: ConstraintDirection = ConstraintDirection.End

  static default(): Constraints {
    const c = new Constraints()
    c.ratios.add(ConstraintRatio.OneToOne)
    c.ratios.add(ConstraintRatio.Horizontal)
    c.ratios.add(ConstraintRatio.Vertical)
    return c
  }

  clone(): Constraints {
    const c = new Constraints()
    c.enabled = this.enabled
    c.ratios = new Set(this.ratios)
    c.direction = this.direction
    return c
  }

  // Snaps a drag delta (from start to current) to the nearest enabled ratio
  // when shift is held / constraints are enabled. Mirrors rnote behaviour of
  // snapping within an angular tolerance.
  constrainSize(start: Vec2, current: Vec2, shiftHeld: boolean): Vec2 {
    if (!this.enabled || !shiftHeld) return current
    const delta = current.sub(start)
    if (delta.length() < 1e-6) return current

    const constrainRatio = (ratio: ConstraintRatio): Vec2 => {
      const x = delta.x
      const y = delta.y
      switch (ratio) {
        case ConstraintRatio.Horizontal:
          return new Vec2(x, 0)
        case ConstraintRatio.Vertical:
          return new Vec2(0, y)
        case ConstraintRatio.OneToOne: {
          if (Math.abs(x) > Math.abs(y)) return new Vec2(x, Math.abs(x) * Math.sign(y || 1))
          return new Vec2(Math.abs(y) * Math.sign(x || 1), y)
        }
        case ConstraintRatio.ThreeToTwo: {
          if (Math.abs(x) > Math.abs(y)) return new Vec2(x, (Math.abs(x) / 1.5) * Math.sign(y || 1))
          return new Vec2((Math.abs(y) / 1.5) * Math.sign(x || 1), y)
        }
        case ConstraintRatio.Golden: {
          const g = 1.618
          if (Math.abs(x) > Math.abs(y)) return new Vec2(x, (Math.abs(x) / g) * Math.sign(y || 1))
          return new Vec2((Math.abs(y) / g) * Math.sign(x || 1), y)
        }
      }
    }

    let best = delta
    let bestDistance = Infinity
    for (const ratio of this.ratios) {
      const candidate = constrainRatio(ratio)
      const distance = candidate.sub(delta).length()
      if (distance < bestDistance) {
        bestDistance = distance
        best = candidate
      }
    }
    return start.add(best)
  }

  // Constrain a direction vector (used for arrows/lines) to axis angles.
  constrainDirection(delta: Vec2, shiftHeld: boolean): Vec2 {
    if (!this.enabled || !shiftHeld || delta.length() < 1e-6) return delta
    const len = delta.length()
    const angle = Math.atan2(delta.y, delta.x)
    // Snap every 15 degrees, with strong horizontal/vertical attraction.
    const step = Math.PI / 12
    let snapped = Math.round(angle / step) * step
    const diff = Math.abs(angle - snapped)
    if (diff < 0.18) {
      return new Vec2(Math.cos(snapped) * len, Math.sin(snapped) * len)
    }
    return delta
  }

  toJSON() {
    return {
      enabled: this.enabled,
      ratios: [...this.ratios],
      direction: this.direction
    }
  }

  static fromJSON(o: any): Constraints {
    const c = new Constraints()
    if (!o) return Constraints.default()
    c.enabled = o.enabled ?? true
    c.ratios = new Set(o.ratios ?? [ConstraintRatio.OneToOne, ConstraintRatio.Horizontal, ConstraintRatio.Vertical])
    c.direction = o.direction ?? ConstraintDirection.End
    return c
  }
}
