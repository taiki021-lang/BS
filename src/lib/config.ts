// Experiment constants. Changing anything here that affects the design MUST
// bump DESIGN_VERSION so that stored responses remain interpretable.

export const DESIGN_VERSION = 'invisible-fares-v1.7'

/**
 * Peak fare in cents (USD 15.00; since v1.7, a regional train from the suburbs into the city).
 * All money is handled in integer cents.
 */
export const PEAK_FARE_CENTS = 1500

/** Off-peak discount levels (percent). */
export const DISCOUNT_LEVELS = [0, 15, 30, 45] as const

/** Number of commuting choice tasks. */
export const NUM_TASKS = 10

/**
 * Commuting allowance for the ten office days, in cents.
 * ASSUMPTION (see README §Assumptions): $150 = ten trips at the peak fare,
 * so an all-peak plan uses exactly the allowance and every shift leaves money over.
 */
export const ALLOWANCE_CENTS = 15000

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const

/** Time shifts for earlier/later off-peak options (minutes). */
export const SHIFT_LEVELS = [30, 60] as const

/** Crowding levels used for the peak option and for off-peak options. */
export const PEAK_CROWDING_LEVELS = ['standing', 'packed'] as const
export const OFFPEAK_CROWDING_LEVELS = ['seated', 'standing'] as const

/** Default usual departure (minutes after midnight) if a respondent has no regular time. */
export const DEFAULT_USUAL_DEPARTURE_MIN = 8 * 60 + 15

/**
 * Range of departure times used in the game (minutes after midnight): 6:30–9:30 a.m.
 * A reported usual time outside this range is clamped, so that "your usual time" is a
 * plausible busy period and shifted times stay realistic (no 4 a.m. or noon departures).
 */
export const GAME_DEPARTURE_MIN = 6 * 60 + 30
export const GAME_DEPARTURE_MAX = 9 * 60 + 30

/** Permuted-block randomization: block size (half A, half B in every block). */
export const BLOCK_SIZE = 4

/** Soft check on the spending estimate: above this amount (cents) we ask for confirmation. */
export const ESTIMATE_CONFIRM_ABOVE_CENTS = 30000
