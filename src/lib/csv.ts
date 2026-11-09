import { WEEKDAYS } from './config'
import type { Submission } from './types'
import { pairIndex } from './design'
import { validateSubmission } from './validate'

/** Options of the post-game "what mattered most" question (also used by the UI, same order). */
export const DECISION_FACTOR_LABELS = [
  'The fare',
  'How crowded the train was',
  'Getting up earlier',
  'Missing or being late for the meeting',
] as const
const FACTOR_KEYS = ['fare', 'crowding', 'early', 'meeting'] as const

type Row = Record<string, string | number | boolean | null | undefined>

function cell(v: Row[string]): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  // Quote when needed; neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v === 'string' ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(rows: Row[]): string {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n'
}

/** One row per participant (wide). */
export function participantRows(subs: Submission[]): Row[] {
  return subs.map((s) => {
    const errs = validateSubmission(s)
    const row: Row = {
      participant_id: s.participant_id,
      condition: s.condition,
      assignment_method: s.assignment_method ?? 'seed',
      assignment_slot: s.assignment_slot ?? null,
      pair_id: s.assignment_method === 'block' && s.assignment_slot ? pairIndex(s.assignment_slot) : null,
      seed: s.seed,
      design_version: s.design_version,
      is_test: s.is_test,
      is_simulated: s.is_simulated,
      integrity_ok: errs.length === 0,
      integrity_errors: errs.join('; '),
      started_at: s.started_at,
      completed_at: s.completed_at,
      ...Object.fromEntries(Object.entries(s.profile).map(([k, v]) => [`profile_${k}`, v as Row[string]])),
      design_usual_departure_min: s.design_usual_departure_min,
      ...Object.fromEntries(WEEKDAYS.map((d) => [`rule_${d.toLowerCase()}_pct`, s.fare_rule[d]])),
      rule_check_attempts: s.rule_check_attempts,
      n_offpeak_time: s.choices.filter((c) => c.chosen_kind === 'early' || c.chosen_kind === 'late').length,
      estimated_total_cents: s.estimated_total_cents,
      actual_total_cents: s.actual_total_cents,
      estimate_error_cents: s.estimated_total_cents - s.actual_total_cents,
      estimate_confidence: s.estimate_confidence,
      estimate_warning_shown: s.estimate_warning_shown ?? null,
      allowance_cents: s.allowance_cents,
      remaining_cents: s.remaining_cents,
      ...Object.fromEntries(WEEKDAYS.map((d) => [`recall_${d.toLowerCase()}`, s.post.recall[d]])),
      recall_correct: WEEKDAYS.filter((d) => s.post.recall[d] === String(s.fare_rule[d])).length,
      tracked_allowance: s.post.tracked_allowance,
      fare_influence: s.post.fare_influence,
      ai_trust: s.post.ai_trust,
      ai_delegate: s.post.ai_delegate,
      fairness_peak_pricing: s.post.fairness_peak_pricing,
      fairness_day_varying: s.post.fairness_day_varying,
      day_switch: s.post.day_switch ?? null,
      taken_before: s.post.taken_before ?? null,
      fares_shown_check: s.post.fares_shown_check ?? null,
      // Manipulation check passed: A says fares were shown, B says they were not.
      manipulation_ok: s.post.fares_shown_check ? s.post.fares_shown_check === (s.condition === 'A' ? 'Yes' : 'No') : null,
      decision_factors: (s.post.decision_factors ?? []).join('; '),
      ...Object.fromEntries(
        FACTOR_KEYS.map((k, i) => [`factor_${k}`, s.post.decision_factors ? Number(s.post.decision_factors.includes(DECISION_FACTOR_LABELS[i])) : null]),
      ),
      ...Object.fromEntries(Object.entries(s.timings ?? {}).map(([k, v]) => [`ms_${k}`, v])),
    }
    return row
  })
}

/** One row per alternative per task (long format, ready for mixed logit). */
export function choiceRows(subs: Submission[]): Row[] {
  const rows: Row[] = []
  for (const s of subs) {
    s.tasks.forEach((t, i) => {
      const c = s.choices[i]
      for (const a of t.alternatives) {
        rows.push({
          participant_id: s.participant_id,
          condition: s.condition,
          seed: s.seed,
          design_version: s.design_version,
          is_test: s.is_test,
          is_simulated: s.is_simulated,
          task_index: t.index,
          day: t.day,
          day_discount_pct: s.fare_rule[t.day],
          shift_min: t.shiftMin,
          peak_crowding: t.peakCrowding,
          offpeak_crowding: t.offPeakCrowding,
          alt_kind: a.kind,
          alt_travel_day: a.travelDay,
          alt_depart_min: a.departMin,
          alt_is_peak: a.isPeak,
          alt_crowding: a.crowding,
          alt_discount_pct: a.discountPct,
          alt_fare_cents: a.fareCents,
          fare_shown: s.condition === 'A',
          chosen: c?.chosen_kind === a.kind ? 1 : 0,
          shown_at: c?.shown_at,
          answered_at: c?.answered_at,
          duration_ms: c?.duration_ms,
          selection_changes: c?.selection_changes,
        })
      }
    })
  }
  return rows
}

/**
 * Balance of the task design between conditions (computed from what each participant actually saw).
 * Crowding and shift are 5/5 within every design, so they should match exactly; discount, WFH fare and
 * the first day differ only by chance. Use these as a randomization check and as controls if needed.
 */
export function balanceByCondition(subs: Submission[]): Row[] {
  return (['A', 'B'] as const).map((c) => {
    const g = subs.filter((s) => s.condition === c)
    const tasks = g.flatMap((s) => s.tasks)
    const mean = (xs: number[]) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3) : null)
    const firstDays = Object.fromEntries(
      WEEKDAYS.map((d) => [`first_day_${d.toLowerCase()}`, mean(g.map((s) => (s.tasks[0]?.day === d ? 1 : 0)))]),
    )
    return {
      condition: c,
      participants: g.length,
      mean_task_discount_pct: mean(tasks.map((t) => t.alternatives[1].discountPct)),
      mean_first_task_discount_pct: mean(g.map((s) => s.tasks[0]?.alternatives[1].discountPct ?? 0)),
      share_peak_packed: mean(tasks.map((t) => (t.peakCrowding === 'packed' ? 1 : 0))),
      share_offpeak_standing: mean(tasks.map((t) => (t.offPeakCrowding === 'standing' ? 1 : 0))),
      share_shift_60: mean(tasks.map((t) => (t.shiftMin === 60 ? 1 : 0))),
      mean_game_departure_min: mean(g.map((s) => s.design_usual_departure_min)),
      ...firstDays,
    }
  })
}
