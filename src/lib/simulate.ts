// Simulated TEST submissions for checking the data pipeline end to end.
// Every simulated record is flagged is_simulated = true and is_test = true.
// These are NOT research data and must be excluded from analysis.

import { ALLOWANCE_CENTS, DESIGN_VERSION, WEEKDAYS } from './config'
import { assignCondition, generateDesign, type AltKind } from './design'
import { mulberry32, pick, randInt } from './rng'
import type { Submission } from './types'
import { sumChosen } from './validate'

export function simulateSubmission(seed: number, participantId: string, now = Date.now()): Submission {
  const r = mulberry32(seed ^ 0x51a1)
  const usual = 7 * 60 + 15 * randInt(r, 9) // 7:00–9:00
  const design = generateDesign(seed, usual)
  let t = now - 10 * 60_000
  const iso = () => new Date(t).toISOString()
  const started = iso()
  const choices = design.tasks.map((task) => {
    const kind = pick<AltKind>(r, ['peak', 'early', 'late'])
    const shown = iso()
    const dur = 2000 + randInt(r, 15000)
    t += dur
    return {
      task_index: task.index,
      day: task.day,
      chosen_kind: kind,
      chosen_fare_cents: task.alternatives.find((a) => a.kind === kind)!.fareCents,
      shown_at: shown,
      answered_at: iso(),
      duration_ms: dur,
      selection_changes: randInt(r, 2),
    }
  })
  const actual = sumChosen({ choices })
  return {
    participant_id: participantId,
    design_version: DESIGN_VERSION,
    seed,
    condition: assignCondition(seed),
    assignment_method: 'seed',
    assignment_slot: null,
    is_test: true,
    is_simulated: true,
    ethics_ref: null,
    started_at: started,
    completed_at: iso(),
    profile: {
      work_experience: 'simulated',
      last_fulltime: null,
      office_days_per_week: String(randInt(r, 6)),
      choose_office_days: 'simulated',
      commute_mode: 'simulated',
      commute_payer: 'simulated',
      transit_payment: 'simulated',
      knew_fare: 'simulated',
      morning_constraint: 'simulated',
      current_role: 'simulated',
      job_region: 'simulated',
      commute_time_band: 'simulated',
      start_time_flexibility: 'simulated',
      usual_departure_min: usual,
      monthly_commute_spend_cents: null,
      age_band: 'simulated',
    },
    design_usual_departure_min: usual,
    fare_rule: design.fareRule,
    tasks: design.tasks,
    choices,
    rule_check_attempts: 1,
    estimate_confidence: 1 + randInt(r, 5),
    estimated_total_cents: 100 * (75 + randInt(r, 76)),
    estimate_warning_shown: false,
    actual_total_cents: actual,
    allowance_cents: ALLOWANCE_CENTS,
    remaining_cents: ALLOWANCE_CENTS - actual,
    post: {
      recall: Object.fromEntries(WEEKDAYS.map((d) => [d, pick(r, ['0', '15', '30', '45', 'unsure'])])) as Submission['post']['recall'],
      tracked_allowance: 'simulated',
      fare_influence: 1 + randInt(r, 5),
      ai_trust: 1 + randInt(r, 5),
      ai_delegate: 'simulated',
      fairness_peak_pricing: 1 + randInt(r, 5),
      fairness_day_varying: 1 + randInt(r, 5),
      taken_before: 'No',
      day_switch: 'simulated',
      fares_shown_check: 'Not sure',
      decision_factors: ['simulated'],
    },
    timings: {},
  }
}
