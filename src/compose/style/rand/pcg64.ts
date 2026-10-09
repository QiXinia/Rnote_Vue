// Exact port of rand_pcg 0.10 `Pcg64` (= Lcg128Xsl64, PCG XSL RR 128/64 LCG),
// seeded exactly like rand_core 0.9 `SeedableRng::seed_from_u64` (PCG32 fill).
// Uses BigInt for the 128-bit LCG state. Reference:
//   rand_pcg-0.10.2/src/pcg128.rs
//   rand_core-0.9.5/src/lib.rs (seed_from_u64)

const MASK64 = 0xffffffffffffffffn
const MASK128 = (1n << 128n) - 1n
const MULTIPLIER_128 = 0x2360ed051fc65da44385df649fccf645n

// rand_core seed_from_u64 PCG32 constants
const PCG32_MUL = 0x5851f42d4c957f2dn
const PCG32_INC = 0xa17654e46fbe17f3n

function u64mul(a: bigint, b: bigint): bigint {
  return (a * b) & MASK64
}

function rotr32(x: bigint, rot: number): bigint {
  const r = ((rot % 32) + 32) % 32
  if (r === 0) return x & 0xffffffffn
  return (((x >> BigInt(r)) | (x << BigInt(32 - r))) & 0xffffffffn)
}

// Produce the 32-byte seed that rand_core's default seed_from_u64 derives.
function seedFromU64(seed: bigint): { state: bigint; increment: bigint } {
  let state = seed & MASK64
  const words: bigint[] = []
  for (let i = 0; i < 8; i++) {
    state = (u64mul(state, PCG32_MUL) + PCG32_INC) & MASK64
    const xorshifted = ((((state >> 18n) ^ state) >> 27n) & 0xffffffffn)
    const rot = Number((state >> 59n) & 31n)
    words.push(rotr32(xorshifted, rot))
  }
  // Each word is a little-endian u32; pairs combine into little-endian u64s.
  const u64s: bigint[] = []
  for (let i = 0; i < 8; i += 2) {
    u64s.push(words[i] | (words[i + 1] << 32n))
  }
  return {
    state: u64s[0] | (u64s[1] << 64n),
    increment: (u64s[2] | (u64s[3] << 64n)) | 1n
  }
}

function outputXslRr(state: bigint): bigint {
  // XSHIFT = 64, ROTATE = 122
  const rot = Number((state >> 122n) & 63n)
  const high = (state >> 64n) & MASK64
  const low = state & MASK64
  const xsl = high ^ low
  if (rot === 0) return xsl
  return (((xsl >> BigInt(rot)) | (xsl << BigInt(64 - rot))) & MASK64)
}

export class Pcg64 {
  private state: bigint
  private readonly increment: bigint

  constructor(seed: bigint | null) {
    if (seed === null) {
      // Rust seeds from the OS thread_rng when seed is None; the result is
      // inherently non-reproducible, so any high-entropy seed is equivalent.
      seed = typeof globalThis.crypto?.getRandomValues === 'function'
        ? cryptoRandomU64()
        : BigInt(Math.floor(Math.random() * Number(MASK64)))
    }
    const { state, increment } = seedFromU64(BigInt(seed))
    this.increment = increment
    // from_state_incr: state += increment, then one step.
    this.state = (state + increment) & MASK128
    this.step()
  }

  private step() {
    this.state = (this.state * MULTIPLIER_128 + this.increment) & MASK128
  }

  nextU64(): bigint {
    this.step()
    return outputXslRr(this.state)
  }

  nextU32(): number {
    return Number(this.nextU64() & 0xffffffffn)
  }
}

function cryptoRandomU64(): bigint {
  const buf = new Uint8Array(8)
  globalThis.crypto?.getRandomValues?.(buf)
  let v = 0n
  for (const b of buf) v = (v << 8n) | BigInt(b)
  return v
}

// rand_pcg::seed_advance: one u64 drawn from a fresh Pcg64 seeded with `seed`.
export function seedAdvance(seed: bigint): bigint {
  return new Pcg64(seed).nextU64()
}
