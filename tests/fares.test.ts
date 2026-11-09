import { describe, expect, it } from 'vitest'
import { PEAK_FARE_CENTS } from '../src/lib/config'
import { fareCents, formatMoney, generateDesign } from '../src/lib/design'

describe('fare calculation', () => {
  it('peak fare is $5.00 regardless of discount', () => {
    for (const d of [0, 15, 30, 45]) expect(fareCents(d, true)).toBe(500)
    expect(PEAK_FARE_CENTS).toBe(500)
  })
  it('off-peak fares match the proposal table', () => {
    expect(fareCents(0, false)).toBe(500)
    expect(fareCents(15, false)).toBe(425)
    expect(fareCents(30, false)).toBe(350)
    expect(fareCents(45, false)).toBe(275)
  })
  it('rejects discounts outside the design', () => {
    expect(() => fareCents(20, false)).toThrow()
    expect(() => fareCents(-5, false)).toThrow()
  })
  it('formats money', () => {
    expect(formatMoney(275)).toBe('$2.75')
    expect(formatMoney(5000)).toBe('$50.00')
    expect(formatMoney(-125)).toBe('−$1.25')
  })
  it('every alternative in a design carries the fare implied by the rule', () => {
    for (let seed = 0; seed < 300; seed++) {
      const d = generateDesign(seed, 8 * 60 + 15)
      for (const t of d.tasks) {
        expect(t.alternatives.map((a) => a.kind)).toEqual(['peak', 'early', 'late'])
        const [peak, early, late] = t.alternatives
        expect(peak.fareCents).toBe(500)
        expect(early.fareCents).toBe(fareCents(d.fareRule[t.day], false))
        expect(late.fareCents).toBe(early.fareCents)
        for (const a of t.alternatives) expect(a.travelDay).toBe(t.day)
      }
    }
  })
  it('off-peak times are shifted by the task time shift', () => {
    const d = generateDesign(42, 8 * 60)
    for (const t of d.tasks) {
      expect(t.alternatives[1].departMin).toBe(8 * 60 - t.shiftMin)
      expect(t.alternatives[2].departMin).toBe(8 * 60 + t.shiftMin)
      expect(t.alternatives[0].departMin).toBe(8 * 60)
    }
  })
})
