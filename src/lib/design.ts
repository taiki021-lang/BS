import {
  BLOCK_SIZE,
  DEFAULT_USUAL_DEPARTURE_MIN,
  DISCOUNT_LEVELS,
  GAME_DEPARTURE_MAX,
  GAME_DEPARTURE_MIN,
  NUM_TASKS,
  OFFPEAK_CROWDING_LEVELS,
  PEAK_CROWDING_LEVELS,
  PEAK_FARE_CENTS,
  SHIFT_LEVELS,
  WEEKDAYS,
} from './config'
import { pick, shuffle, stream } from './rng'

export type Weekday = (typeof WEEKDAYS)[number]
export type Discount = (typeof DISCOUNT_LEVELS)[number]
export type Crowding = 'seated' | 'standing' | 'packed'
export type Condition = 'A' | 'B'
export type AltKind = 'peak' | 'early' | 'late'
export type Shift = (typeof SHIFT_LEVELS)[number]

export type FareRule = Record<Weekday, Discount>

export interface Alternative {
  kind: AltKind
  /** Day on which the trip is made (always the task day since v1.5). */
  travelDay: Weekday
  /** Departure time in minutes after midnight. */
  departMin: number
  isPeak: boolean
  crowding: Crowding
  /** Off-peak discount that applies to this trip (0 for peak trips). */
  discountPct: number
  /** Actual fare in cents. Stored for every alternative, including hidden fares in condition B. */
  fareCents: number
}

export interface Task {
  index: number
  day: Weekday
  shiftMin: Shift
  peakCrowding: Crowding
  offPeakCrowding: Crowding
  /** Always ordered: peak, early, late (identical in both conditions). */
  alternatives: Alternative[]
}

export interface Design {
  fareRule: FareRule
  /** The discount level that appears on two weekdays (5 days, 4 levels). */
  repeatedDiscount: Discount
  tasks: Task[]
}

// Salts for independent random streams derived from the participant seed.
const SALT_CONDITION = 1
const SALT_DESIGN = 2
const SALT_BLOCK = 3
const SALT_PAIR = 4

/** Fare for a trip given the day's discount. Integer cents. */
export function fareCents(discountPct: number, isPeak: boolean): number {
  if (isPeak) return PEAK_FARE_CENTS
  if (!(DISCOUNT_LEVELS as readonly number[]).includes(discountPct)) {
    throw new Error(`Invalid discount ${discountPct}`)
  }
  return Math.round((PEAK_FARE_CENTS * (100 - discountPct)) / 100)
}

/**
 * Fallback condition assignment: simple 1:1 randomization, reproducible from the seed.
 * Used only when the server-side block slot cannot be obtained (assignment_method = 'seed').
 */
export function assignCondition(seed: number): Condition {
  return stream(seed, SALT_CONDITION)() < 0.5 ? 'A' : 'B'
}

/**
 * Permuted-block randomization (primary method, assignment_method = 'block').
 * Slots 1, 2, 3, … come from a server-side sequence. Slots are grouped into blocks of
 * BLOCK_SIZE; each block holds exactly half A and half B in a reproducible random order.
 */
export function blockCondition(slot: number): Condition {
  return blockPosition(slot).condition
}

function blockPosition(slot: number): { block: number; condition: Condition; rank: number } {
  if (!Number.isInteger(slot) || slot < 1) throw new Error(`Invalid slot ${slot}`)
  const block = Math.floor((slot - 1) / BLOCK_SIZE)
  const pattern = shuffle(stream(block, SALT_BLOCK), [
    ...Array<Condition>(BLOCK_SIZE / 2).fill('A'),
    ...Array<Condition>(BLOCK_SIZE / 2).fill('B'),
  ])
  const pos = (slot - 1) % BLOCK_SIZE
  const condition = pattern[pos]
  // rank = how many earlier slots in this block have the same condition (0, 1, ...)
  const rank = pattern.slice(0, pos).filter((c) => c === condition).length
  return { block, condition, rank }
}

/**
 * Paired design: within each block, the k-th A slot and the k-th B slot form a pair and receive the
 * SAME design seed, so they see identical task sets (fare rule, day order, attribute pairing, make-up days).
 * Only the clock times differ (they follow each person's usual departure time). Returns the pair index.
 */
export function pairIndex(slot: number): number {
  const { block, rank } = blockPosition(slot)
  return block * (BLOCK_SIZE / 2) + rank
}

/** Design seed shared by both members of a pair (block method only). */
export function pairSeed(slot: number): number {
  return Math.floor(stream(pairIndex(slot), SALT_PAIR)() * 4294967296) >>> 0
}

/** Usual departure time used in the game: profile answer (or default), clamped to 6:30–9:30. */
export function gameDepartureMin(reported: number | null | undefined): number {
  const m = reported ?? DEFAULT_USUAL_DEPARTURE_MIN
  return Math.min(GAME_DEPARTURE_MAX, Math.max(GAME_DEPARTURE_MIN, m))
}

/**
 * Generate the choice-task design for a participant.
 * Depends only on the seed and the usual departure time — never on the condition —
 * so condition A and B participants with the same seed get identical tasks.
 */
export function generateDesign(seed: number, usualDepartureMin: number): Design {
  const rng = stream(seed, SALT_DESIGN)

  // 1. Fare rule: 5 weekdays, 4 discount levels -> every level appears, one level twice.
  const repeatedDiscount = pick(rng, DISCOUNT_LEVELS)
  const discounts = shuffle(rng, [...DISCOUNT_LEVELS, repeatedDiscount])
  const fareRule = Object.fromEntries(WEEKDAYS.map((d, i) => [d, discounts[i]])) as FareRule

  // 2. Attribute profiles (peak crowding × off-peak crowding × shift): 2×2×2 full
  //    factorial (8) plus one random profile and its fold-over complement (2) = 10,
  //    so every attribute level appears exactly 5 times.
  const full: [Crowding, Crowding, Shift][] = []
  for (const pc of PEAK_CROWDING_LEVELS)
    for (const oc of OFFPEAK_CROWDING_LEVELS)
      for (const s of SHIFT_LEVELS) full.push([pc, oc, s])
  const extra = pick(rng, full)
  const flip = <T>(levels: readonly T[], v: T) => levels[1 - levels.indexOf(v)]
  const complement: [Crowding, Crowding, Shift] = [
    flip(PEAK_CROWDING_LEVELS, extra[0] as (typeof PEAK_CROWDING_LEVELS)[number]),
    flip(OFFPEAK_CROWDING_LEVELS, extra[1] as (typeof OFFPEAK_CROWDING_LEVELS)[number]),
    flip(SHIFT_LEVELS, extra[2]),
  ]
  const profiles = shuffle(rng, [...full, extra, complement])

  // 3. Days: each weekday exactly twice, in random order.
  const days = shuffle(rng, [...WEEKDAYS, ...WEEKDAYS])

  const tasks: Task[] = []
  for (let i = 0; i < NUM_TASKS; i++) {
    const day = days[i]
    const [peakCrowding, offPeakCrowding, shiftMin] = profiles[i]
    const dayDisc = fareRule[day]
    tasks.push({
      index: i,
      day,
      shiftMin,
      peakCrowding,
      offPeakCrowding,
      alternatives: [
        { kind: 'peak', travelDay: day, departMin: usualDepartureMin, isPeak: true, crowding: peakCrowding, discountPct: 0, fareCents: fareCents(0, true) },
        { kind: 'early', travelDay: day, departMin: usualDepartureMin - shiftMin, isPeak: false, crowding: offPeakCrowding, discountPct: dayDisc, fareCents: fareCents(dayDisc, false) },
        { kind: 'late', travelDay: day, departMin: usualDepartureMin + shiftMin, isPeak: false, crowding: offPeakCrowding, discountPct: dayDisc, fareCents: fareCents(dayDisc, false) },
      ],
    })
  }
  return { fareRule, repeatedDiscount, tasks }
}

export function formatTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440
  const h24 = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  const suffix = h24 < 12 ? 'a.m.' : 'p.m.'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${mm} ${suffix}`
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '−' : ''
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`
}

/** Human-readable shifting cost shown identically in both conditions. */
export function costText(task: Task, kind: AltKind): string {
  const s = task.shiftMin === 60 ? '1 hour' : '30 minutes'
  switch (kind) {
    case 'peak':
      return 'No change to your routine'
    case 'early':
      return `Wake up ${s} earlier`
    case 'late':
      return task.shiftMin === 60
        ? 'Miss your morning team meeting'
        : 'Arrive 30 minutes late for your morning team meeting'
  }
}

export function altTitle(kind: AltKind): string {
  return { peak: 'Usual time · peak', early: 'Earlier · off-peak', late: 'Later · off-peak' }[kind]
}

export function whenText(task: Task, a: Alternative, usualMin: number): string {
  void task
  const t = formatTime(a.departMin ?? usualMin)
  return a.kind === 'peak' ? `Leave ${t} (your usual time)` : `Leave ${t}`
}
