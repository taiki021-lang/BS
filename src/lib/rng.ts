// Small, dependency-free, reproducible PRNG (mulberry32).
// The same 32-bit seed always yields the same sequence on every platform.

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Independent stream derived from a seed (so condition and design never share draws). */
export function stream(seed: number, salt: number): Rng {
  return mulberry32((seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0)
}

export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n)
}

export function pick<T>(rng: Rng, xs: readonly T[]): T {
  return xs[randInt(rng, xs.length)]
}

/** Fisher–Yates shuffle returning a new array. */
export function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Cryptographically random 32-bit seed for a new participant. */
export function newSeed(): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0]
}
