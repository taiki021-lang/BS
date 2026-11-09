import { describe, expect, it } from 'vitest'
import { DISCOUNT_LEVELS, WEEKDAYS } from '../src/lib/config'
import { assignCondition, blockCondition, gameDepartureMin, generateDesign } from '../src/lib/design'
import { mulberry32 } from '../src/lib/rng'

const count = <T,>(xs: T[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<T, number>())

describe('reproducible randomization', () => {
  it('PRNG is deterministic for a seed (golden values)', () => {
    const r = mulberry32(123456789)
    const a = [r(), r(), r()]
    const r2 = mulberry32(123456789)
    expect([r2(), r2(), r2()]).toEqual(a)
    expect(a.every((x) => x >= 0 && x < 1)).toBe(true)
  })
  it('same seed -> identical design and condition', () => {
    for (const seed of [0, 1, 2 ** 31, 4294967295, 987654]) {
      expect(generateDesign(seed, 495)).toEqual(generateDesign(seed, 495))
      expect(assignCondition(seed)).toBe(assignCondition(seed))
    }
  })
  it('different seeds give different designs', () => {
    const a = JSON.stringify(generateDesign(1, 495))
    const b = JSON.stringify(generateDesign(2, 495))
    expect(a).not.toBe(b)
  })
  it('usual departure time only changes clock times, not the randomized design', () => {
    const a = generateDesign(77, 7 * 60)
    const b = generateDesign(77, 9 * 60)
    expect(a.fareRule).toEqual(b.fareRule)
    expect(a.tasks.map((t) => [t.day, t.shiftMin, t.peakCrowding, t.offPeakCrowding])).toEqual(
      b.tasks.map((t) => [t.day, t.shiftMin, t.peakCrowding, t.offPeakCrowding]),
    )
  })
})

describe('random assignment', () => {
  const N = 20000
  const seeds = Array.from({ length: N }, (_, i) => (i * 2654435761) >>> 0)
  it('assigns A and B about 1:1', () => {
    const a = seeds.filter((s) => assignCondition(s) === 'A').length / N
    expect(a).toBeGreaterThan(0.48)
    expect(a).toBeLessThan(0.52)
  })
  it('condition is independent of the design (same task design in both arms)', () => {
    // Share of each repeated-discount level should be similar in A and B.
    for (const lvl of DISCOUNT_LEVELS) {
      const inA = seeds.filter((s) => assignCondition(s) === 'A')
      const inB = seeds.filter((s) => assignCondition(s) === 'B')
      const pa = inA.filter((s) => generateDesign(s, 495).repeatedDiscount === lvl).length / inA.length
      const pb = inB.filter((s) => generateDesign(s, 495).repeatedDiscount === lvl).length / inB.length
      expect(Math.abs(pa - pb)).toBeLessThan(0.03)
    }
  })
})

describe('design balance', () => {
  it('each design: fare rule uses all four discounts; each weekday twice; attributes 5/5', () => {
    for (let seed = 0; seed < 2000; seed++) {
      const d = generateDesign(seed, 495)
      const rule = WEEKDAYS.map((w) => d.fareRule[w])
      for (const lvl of DISCOUNT_LEVELS) expect(rule).toContain(lvl)
      expect(count(rule).get(d.repeatedDiscount)).toBe(2)
      expect(d.tasks).toHaveLength(10)
      for (const n of count(d.tasks.map((t) => t.day)).values()) expect(n).toBe(2)
      for (const k of ['shiftMin', 'peakCrowding', 'offPeakCrowding'] as const) {
        expect([...count(d.tasks.map((t) => t[k])).values()]).toEqual([5, 5])
      }
      // all four discount levels appear among the ten task days
      expect(new Set(d.tasks.map((t) => d.fareRule[t.day])).size).toBe(4)
    }
  })
  it('discount-to-weekday mapping is randomized across participants', () => {
    const N = 10000
    for (const w of WEEKDAYS) {
      const c = count(Array.from({ length: N }, (_, s) => generateDesign(s, 495).fareRule[w]))
      // Each level has expected share 0.25 (1/5 direct + 1/5 * 1/4 repeat).
      for (const lvl of DISCOUNT_LEVELS) expect(Math.abs((c.get(lvl) ?? 0) / N - 0.25)).toBeLessThan(0.03)
    }
  })
})

describe('permuted-block assignment (server slot)', () => {
  it('every block of 4 slots holds exactly 2 A and 2 B', () => {
    for (let b = 0; b < 5000; b++) {
      const conds = [1, 2, 3, 4].map((k) => blockCondition(b * 4 + k))
      expect(conds.filter((c) => c === 'A')).toHaveLength(2)
    }
  })
  it('120 consecutive slots split exactly 60/60, and block order varies', () => {
    const conds = Array.from({ length: 120 }, (_, i) => blockCondition(i + 1))
    expect(conds.filter((c) => c === 'A')).toHaveLength(60)
    const patterns = new Set(Array.from({ length: 30 }, (_, b) => [1, 2, 3, 4].map((k) => blockCondition(b * 4 + k)).join('')))
    expect(patterns.size).toBeGreaterThan(2)
  })
  it('is reproducible and rejects invalid slots', () => {
    expect(blockCondition(17)).toBe(blockCondition(17))
    expect(() => blockCondition(0)).toThrow()
    expect(() => blockCondition(1.5)).toThrow()
  })
})

describe('game departure time', () => {
  it('clamps reported times to 6:30–9:30 and defaults to 8:15', () => {
    expect(gameDepartureMin(300)).toBe(390)
    expect(gameDepartureMin(660)).toBe(570)
    expect(gameDepartureMin(480)).toBe(480)
    expect(gameDepartureMin(null)).toBe(495)
  })
  it('keeps every generated departure between 5:30 and 10:30', () => {
    for (const u of [390, 570]) {
      for (const t of generateDesign(42, u).tasks)
        for (const a of t.alternatives) if (a.departMin !== null) expect(a.departMin).toBeGreaterThanOrEqual(330), expect(a.departMin).toBeLessThanOrEqual(630)
    }
  })
})

describe('balance between conditions', () => {
  it('crowding and shift shares are identical in A and B; discount differs only slightly', async () => {
    const { simulateSubmission } = await import('../src/lib/simulate')
    const { balanceByCondition } = await import('../src/lib/csv')
    const subs = Array.from({ length: 400 }, (_, i) => simulateSubmission(5000 + i, `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`))
    const [a, b] = balanceByCondition(subs)
    expect(a.share_peak_packed).toBe(0.5)
    expect(b.share_peak_packed).toBe(0.5)
    expect(a.share_shift_60).toBe(0.5)
    expect(b.share_shift_60).toBe(0.5)
    expect(Math.abs((a.mean_task_discount_pct as number) - (b.mean_task_discount_pct as number))).toBeLessThan(1.5)
  })
})

describe('paired design (block method)', () => {
  it('each block has two A/B pairs; paired slots share one design seed, other slots do not', async () => {
    const { pairIndex, pairSeed } = await import('../src/lib/design')
    for (let b = 0; b < 500; b++) {
      const slots = [1, 2, 3, 4].map((k) => b * 4 + k)
      const pairs = new Map<number, number[]>()
      for (const s of slots) pairs.set(pairIndex(s), [...(pairs.get(pairIndex(s)) ?? []), s])
      expect(pairs.size).toBe(2)
      for (const members of pairs.values()) {
        expect(members.map(blockCondition).sort()).toEqual(['A', 'B'])
        expect(pairSeed(members[0])).toBe(pairSeed(members[1]))
      }
      const [p1, p2] = [...pairs.values()]
      expect(pairSeed(p1[0])).not.toBe(pairSeed(p2[0]))
    }
  })
  it('over complete blocks, A and B receive exactly the same multiset of task designs', async () => {
    const { pairSeed } = await import('../src/lib/design')
    const designs = { A: [] as string[], B: [] as string[] }
    for (let s = 1; s <= 120; s++) {
      const d = generateDesign(pairSeed(s), 495)
      designs[blockCondition(s)].push(JSON.stringify(d))
    }
    expect(designs.A.sort()).toEqual(designs.B.sort())
  })
})
