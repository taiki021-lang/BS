import { ALLOWANCE_CENTS, DESIGN_VERSION, NUM_TASKS } from './config'
import { assignCondition, blockCondition, fareCents, gameDepartureMin, generateDesign, pairSeed } from './design'
import type { Submission } from './types'

const KIND_ORDER = ['peak', 'early', 'late']

/** Key-order-independent JSON (Postgres jsonb does not preserve key order). */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}

export function sumChosen(sub: Pick<Submission, 'choices'>): number {
  return sub.choices.reduce((s, c) => s + c.chosen_fare_cents, 0)
}

/**
 * Integrity checks run before submission (client) and again at export time.
 * Returns a list of problems; an empty list means the record is internally consistent
 * AND reproducible from its seed.
 */
export function validateSubmission(sub: Submission): string[] {
  const errs: string[] = []
  if (sub.design_version !== DESIGN_VERSION) errs.push(`design_version ${sub.design_version} != ${DESIGN_VERSION}`)
  if (!/^[0-9a-f-]{36}$/i.test(sub.participant_id)) errs.push('participant_id is not a UUID')
  if (!Number.isInteger(sub.seed) || sub.seed < 0 || sub.seed > 0xffffffff) errs.push('seed out of range')
  if (sub.assignment_method === 'block') {
    if (!Number.isInteger(sub.assignment_slot) || (sub.assignment_slot as number) < 1) errs.push('assignment_slot invalid')
    else {
      if (sub.condition !== blockCondition(sub.assignment_slot as number)) errs.push('condition does not match block slot')
      if (sub.seed !== pairSeed(sub.assignment_slot as number)) errs.push('seed does not match paired design for slot')
    }
  } else if (sub.condition !== assignCondition(sub.seed)) errs.push('condition does not match seed')
  if (sub.profile && sub.design_usual_departure_min !== gameDepartureMin(sub.profile.usual_departure_min))
    errs.push('design_usual_departure_min does not match clamped profile time')
  if (!Array.isArray(sub.tasks) || sub.tasks.length !== NUM_TASKS) errs.push('tasks length != 10')
  if (!Array.isArray(sub.choices) || sub.choices.length !== NUM_TASKS) errs.push('choices length != 10')
  if (errs.length) return errs

  // Re-generate the design from the seed and compare (detects tampering / drift).
  const expected = generateDesign(sub.seed, sub.design_usual_departure_min)
  if (canonical(expected.tasks) !== canonical(sub.tasks)) errs.push('tasks do not match regenerated design')
  if (canonical(expected.fareRule) !== canonical(sub.fare_rule)) errs.push('fare_rule does not match regenerated design')

  sub.tasks.forEach((t, i) => {
    if (t.index !== i) errs.push(`task ${i}: bad index`)
    if (t.alternatives.map((a) => a.kind).join() !== KIND_ORDER.join()) errs.push(`task ${i}: alternative order`)
    for (const a of t.alternatives) {
      const disc = a.isPeak ? 0 : sub.fare_rule[a.travelDay]
      if (a.discountPct !== disc) errs.push(`task ${i} ${a.kind}: discount mismatch`)
      if (a.fareCents !== fareCents(disc, a.isPeak)) errs.push(`task ${i} ${a.kind}: fare mismatch`)
    }
  })

  sub.choices.forEach((c, i) => {
    const t = sub.tasks[i]
    if (c.task_index !== i) errs.push(`choice ${i}: bad task_index`)
    if (c.day !== t.day) errs.push(`choice ${i}: day mismatch`)
    const alt = t.alternatives.find((a) => a.kind === c.chosen_kind)
    if (!alt) errs.push(`choice ${i}: unknown alternative ${c.chosen_kind}`)
    else if (alt.fareCents !== c.chosen_fare_cents) errs.push(`choice ${i}: chosen fare mismatch`)
    if (!(c.duration_ms >= 0)) errs.push(`choice ${i}: negative duration`)
  })

  const total = sumChosen(sub)
  if (sub.actual_total_cents !== total) errs.push('actual_total_cents != sum of chosen fares')
  if (sub.allowance_cents !== ALLOWANCE_CENTS) errs.push('allowance mismatch')
  if (sub.remaining_cents !== sub.allowance_cents - sub.actual_total_cents) errs.push('remaining_cents mismatch')
  if (!Number.isInteger(sub.estimated_total_cents) || sub.estimated_total_cents < 0) errs.push('estimate invalid')
  return errs
}
