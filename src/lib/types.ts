import type { AltKind, Condition, FareRule, Task, Weekday } from './design'

export interface Profile {
  /** 'I currently / previously / have never worked full-time'. */
  work_experience: string
  /** 'Currently', 'Within the past year', '1–3 years ago', 'More than 3 years ago', or null (never worked full-time). */
  last_fulltime: string | null
  office_days_per_week: string
  choose_office_days: string
  commute_mode: string
  /** Who paid for commuting: employer all / part, self, not sure. */
  commute_payer: string | null
  /** How they usually paid for public transit (pass, pay per trip, employer pass, ...). */
  transit_payment: string
  /** Whether they knew the single-trip fare of their usual commute. */
  knew_fare: string
  /** Whether morning responsibilities fixed their departure time. */
  morning_constraint: string
  /** Current role (MIT staff/faculty, Sloan Fellow, MBA, ...). */
  current_role: string
  /** Broad region of the job (or residence if never worked full-time). */
  job_region: string
  /** Typical one-way door-to-door commute time band, e.g. '30–44 min'. */
  commute_time_band: string
  start_time_flexibility: string
  /** Usual departure in minutes after midnight, or null if no regular time. */
  usual_departure_min: number | null
  /** Self-reported total monthly commuting cost at that job (roughly in USD), in cents, or null for "don't know". */
  monthly_commute_spend_cents: number | null
  age_band: string
}

export interface ChoiceRecord {
  task_index: number
  day: Weekday
  chosen_kind: AltKind
  chosen_fare_cents: number
  shown_at: string
  answered_at: string
  duration_ms: number
  /** Number of times the selection was changed before confirming. */
  selection_changes: number
}

export interface PostGame {
  /** Recalled off-peak discount per weekday ("0","15","30","45" or "unsure"). */
  recall: Record<Weekday, string>
  tracked_allowance: string
  fare_influence: number
  ai_trust: number
  ai_delegate: string
  fairness_peak_pricing: number
  fairness_day_varying: number
  /** Hypothetical: would move an office day to a day with a 45% off-peak discount ('Yes'/'Maybe'/'No'/'I can’t choose my office days'). */
  day_switch: string
  /** 'Yes' / 'No' / 'Not sure': has taken part in this survey before. */
  taken_before: string
  /** Manipulation check: were fares shown next to each option? ('Yes' / 'No' / 'Not sure') */
  fares_shown_check: string
  /** Up to two most important factors in the choices (labels from DECISION_FACTOR_LABELS). */
  decision_factors: string[]
}

export interface Submission {
  participant_id: string
  design_version: string
  seed: number
  condition: Condition
  /** 'block' = server permuted-block slot; 'seed' = fallback seed-based assignment. */
  assignment_method: 'block' | 'seed'
  /** Server sequence slot (block method), else null. */
  assignment_slot: number | null
  is_test: boolean
  is_simulated: boolean
  ethics_ref: string | null
  started_at: string
  completed_at: string
  profile: Profile
  /** Usual departure used to build the tasks (profile value or default). */
  design_usual_departure_min: number
  fare_rule: FareRule
  tasks: Task[]
  choices: ChoiceRecord[]
  rule_check_attempts: number
  estimate_confidence: number
  estimated_total_cents: number
  /** True if the high-estimate confirmation prompt was shown before the bill. */
  estimate_warning_shown: boolean
  actual_total_cents: number
  allowance_cents: number
  remaining_cents: number
  post: PostGame
  timings: Record<string, number>
}
