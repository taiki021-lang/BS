import { describe, expect, it } from 'vitest'
import { choiceRows, participantRows, toCsv } from '../src/lib/csv'
import { simulateSubmission } from '../src/lib/simulate'
import type { Submission } from '../src/lib/types'
import { blockCondition, pairSeed } from '../src/lib/design'
import { validateSubmission } from '../src/lib/validate'

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const clone = (s: Submission): Submission => JSON.parse(JSON.stringify(s))

/** Reverse key order recursively, as Postgres jsonb may do. */
const shuffleKeys = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(shuffleKeys)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, shuffleKeys(x)]))
      : v

describe('data integrity', () => {
  const subs = Array.from({ length: 50 }, (_, i) => simulateSubmission(1000 + i, uuid(i)))

  it('simulated records pass validation and are flagged', () => {
    for (const s of subs) {
      expect(validateSubmission(s)).toEqual([])
      expect(s.is_simulated).toBe(true)
      expect(s.is_test).toBe(true)
    }
  })
  it('stores fares for every alternative, including hidden fares in condition B', () => {
    const b = subs.find((s) => s.condition === 'B')!
    for (const t of b.tasks) for (const a of t.alternatives) expect(a.fareCents).toBeGreaterThan(0)
  })
  it('survives a database round trip with reordered keys', () => {
    for (const s of subs.slice(0, 5)) expect(validateSubmission(shuffleKeys(clone(s)) as Submission)).toEqual([])
  })
  it('detects a tampered fare', () => {
    const s = clone(subs[0])
    s.tasks[3].alternatives[1].fareCents = 1
    expect(validateSubmission(s).join()).toMatch(/fare/)
  })
  it('detects a wrong condition', () => {
    const s = clone(subs[0])
    s.condition = s.condition === 'A' ? 'B' : 'A'
    expect(validateSubmission(s)).toContain('condition does not match seed')
  })
  it('detects a wrong total', () => {
    const s = clone(subs[0])
    s.actual_total_cents += 25
    expect(validateSubmission(s)).toContain('actual_total_cents != sum of chosen fares')
  })
  it('detects a chosen fare that does not match the chosen alternative', () => {
    const s = clone(subs[0])
    s.choices[0].chosen_fare_cents = 123
    expect(validateSubmission(s).join()).toMatch(/chosen fare mismatch/)
  })
  it('accepts a block-assigned record and detects a condition that does not match its slot', () => {
    const s = clone(simulateSubmission(pairSeed(7), uuid(77)))
    s.assignment_method = 'block'
    s.assignment_slot = 7
    s.condition = blockCondition(7)
    expect(validateSubmission(s)).toEqual([])
    s.condition = s.condition === 'A' ? 'B' : 'A'
    expect(validateSubmission(s)).toContain('condition does not match block slot')
  })
  it('detects a block record whose seed is not the paired design seed', () => {
    const s = clone(subs[0])
    s.assignment_method = 'block'
    s.assignment_slot = 7
    s.condition = blockCondition(7)
    expect(validateSubmission(s)).toContain('seed does not match paired design for slot')
  })
  it('detects a game departure time that was not clamped from the profile', () => {
    const s = clone(subs[0])
    s.profile.usual_departure_min = 300
    expect(validateSubmission(s)).toContain('design_usual_departure_min does not match clamped profile time')
  })
  it('detects missing tasks', () => {
    const s = clone(subs[0])
    s.choices.pop()
    expect(validateSubmission(s)).toContain('choices length != 10')
  })
})

describe('CSV export', () => {
  const subs = Array.from({ length: 6 }, (_, i) => simulateSubmission(77 + i, uuid(i)))
  it('long format has 30 rows per participant (3 options x 10 tasks) and exactly one chosen per task', () => {
    const rows = choiceRows(subs)
    expect(rows).toHaveLength(6 * 30)
    for (const s of subs)
      for (let t = 0; t < 10; t++) {
        const task = rows.filter((r) => r.participant_id === s.participant_id && r.task_index === t)
        expect(task).toHaveLength(3)
        expect(task.filter((r) => r.chosen === 1)).toHaveLength(1)
      }
  })
  it('participant rows recompute integrity and totals', () => {
    const rows = participantRows(subs)
    expect(rows).toHaveLength(6)
    for (const r of rows) {
      expect(r.integrity_ok).toBe(true)
      expect(r.estimate_error_cents).toBe((r.estimated_total_cents as number) - (r.actual_total_cents as number))
    }
  })
  it('escapes commas/quotes and neutralises formulas', () => {
    const csv = toCsv([{ a: 'x,"y"', b: '=HYPERLINK(1)', c: null, d: 3 }])
    expect(csv).toBe(`a,b,c,d\r\n"x,""y""",'=HYPERLINK(1),,3\r\n`)
  })
  it('contains no direct identifiers', () => {
    const header = Object.keys(participantRows(subs)[0]).join(',')
    expect(header).not.toMatch(/name|email|phone|address|\bip\b/i)
  })
})

describe('v1.3 post-game columns', () => {
  it('scores the manipulation check by condition and expands decision factors', () => {
    const subs = [simulateSubmission(5, uuid(1)), simulateSubmission(6, uuid(2)), simulateSubmission(7, uuid(3)), simulateSubmission(8, uuid(4))]
    const a = clone(subs.find((s) => s.condition === 'A')!)
    const b = clone(subs.find((s) => s.condition === 'B')!)
    a.post.fares_shown_check = 'Yes'
    b.post.fares_shown_check = 'Yes'
    a.post.decision_factors = ['The fare', 'Getting up earlier']
    const [ra, rb] = participantRows([a, b])
    expect(ra.manipulation_ok).toBe(true)
    expect(rb.manipulation_ok).toBe(false)
    expect([ra.factor_fare, ra.factor_crowding, ra.factor_early, ra.factor_meeting]).toEqual([1, 0, 1, 0])
    expect(ra).toHaveProperty('day_switch')
  })
})

describe('CSV header covers all rows', () => {
  it('keeps columns that only later rows have (records from different versions)', () => {
    const csv = toCsv([{ a: 1 }, { a: 2, b: 'new' }])
    expect(csv.split('\r\n')[0]).toBe('a,b')
    expect(csv.split('\r\n')[2]).toBe('2,new')
  })
})
