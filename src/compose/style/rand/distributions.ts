// Exact ports of the rand 0.9 / rand_distr 0.6 sampling primitives used by
// Rnote's textured style:
//  - StandardUniform f64 / bool and Open01 f64
//  - Uniform f64 (rand::distr::uniform::UniformFloat, bounded constructor)
//  - StandardNormal / Exp1 via the ZIGNOR ziggurat method
// Reference: rand-0.9.4/src/distr/{float,uniform_float,other}.rs and
// rand_distr-0.6.0/src/{utils,normal,exponential}.rs.

import { Pcg64 } from './pcg64'
import {
  ZIG_NORM_X,
  ZIG_NORM_F,
  ZIG_EXP_X,
  ZIG_EXP_F,
  ZIG_NORM_R,
  ZIG_EXP_R
} from './ziggurat-tables'

const MASK64 = (1n << 64n) - 1n

// StandardUniform<f64>: multiply based, 53 random bits, [0, 1).
export function standardF64(rng: Pcg64): number {
  return Number((rng.nextU64() >> 11n) & MASK64) * (1.0 / 9007199254740992.0) // 2^53
}

// StandardUniform<bool>: sign bit of a u32.
export function standardBool(rng: Pcg64): boolean {
  return (rng.nextU32() & 0x80000000) !== 0
}

// Open01<f64>: transmute based, (0, 1).
export function open01F64(rng: Pcg64): number {
  const fraction = Number((rng.nextU64() >> 12n) & MASK64) // 52 bits
  return 1 + fraction * (1.0 / 4503599627370496.0) - (1.0 - Number.EPSILON / 2) // 2^52
}

// Decrease a positive finite f64 by one ULP (rand UniformFloat::decrease_masked).
function nextDownPositive(x: number): number {
  const buf = new ArrayBuffer(8)
  const dv = new DataView(buf)
  dv.setFloat64(0, x, true)
  let bits = dv.getBigUint64(0, true)
  bits -= 1n
  dv.setBigUint64(0, bits, true)
  return dv.getFloat64(0, true)
}

export class UniformF64 {
  private constructor(
    private readonly low: number,
    private readonly scale: number
  ) {}

  // rand_distr Uniform::try_from(low..high) for f64.
  static new(low: number, high: number): UniformF64 {
    if (!(low < high)) throw new Error('empty uniform range')
    let scale = high - low
    const maxRand = 1.0 - Number.EPSILON
    // new_bounded: reduce scale so rounding can never exceed high.
    while (scale * maxRand + low > high) {
      scale = nextDownPositive(scale)
    }
    return new UniformF64(low, scale)
  }

  sample(rng: Pcg64): number {
    const bits = rng.nextU64()
    // (u >> 11) -> [1,2) via exponent 0, subtract 1 -> [0,1), then scale.
    const value01 = Number((bits >> 12n) & MASK64) * (1.0 / 4503599627370496.0)
    return value01 * this.scale + this.low
  }
}

function ziggurat(
  rng: Pcg64,
  symmetric: boolean,
  xTab: readonly number[],
  fTab: readonly number[],
  pdf: (x: number) => number,
  zeroCase: (rng: Pcg64, u: number) => number
): number {
  for (;;) {
    const bits = rng.nextU64()
    const i = Number(bits & 0xffn)
    let u: number
    if (symmetric) {
      // (bits >> 12).into_float_with_exponent(1) - 3 -> [-1,1): the 52-bit
      // mantissa is scaled by 2^1, i.e. 2 + frac*2^-51 - 3.
      const fraction = Number((bits >> 12n) & MASK64)
      u = 2 + fraction * (1.0 / 2251799813685248.0) - 3.0 // 2^51
    } else {
      const fraction = Number((bits >> 12n) & MASK64)
      u = 1 + fraction * (1.0 / 4503599627370496.0) - (1.0 - Number.EPSILON / 2.0)
    }
    const x = u * xTab[i]
    const testX = symmetric ? Math.abs(x) : x
    if (testX < xTab[i + 1]) return x
    if (i === 0) return zeroCase(rng, u)
    if (fTab[i + 1] + (fTab[i] - fTab[i + 1]) * standardF64(rng) < pdf(x)) return x
  }
}

// Standard normal N(0,1).
export function standardNormal(rng: Pcg64): number {
  return ziggurat(
    rng,
    true,
    ZIG_NORM_X,
    ZIG_NORM_F,
    (x) => Math.exp((-x * x) / 2),
    (rng, u) => {
      let x = 1
      let y = 0
      while (-2 * y < x * x) {
        const x_ = Math.log(open01F64(rng)) / ZIG_NORM_R
        const y_ = Math.log(open01F64(rng))
        x = x_
        y = y_
      }
      return u < 0 ? x - ZIG_NORM_R : ZIG_NORM_R - x
    }
  )
}

// Normal N(mean, stdDev^2).
export function normalSample(rng: Pcg64, mean: number, stdDev: number): number {
  return mean + stdDev * standardNormal(rng)
}

// Standard exponential Exp(1).
export function exp1(rng: Pcg64): number {
  return ziggurat(
    rng,
    false,
    ZIG_EXP_X,
    ZIG_EXP_F,
    (x) => Math.exp(-x),
    (rng) => ZIG_EXP_R - Math.log(standardF64(rng))
  )
}
