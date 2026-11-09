// Client-side runtime configuration (Vite env vars; all are public by design).
// NEVER put the Supabase service-role key in a VITE_ variable.

const env = import.meta.env

export const SUPABASE_URL: string = env.VITE_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY: string = env.VITE_SUPABASE_ANON_KEY ?? ''
export const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

/** Optional ethics reference. Not required: the course instructor confirmed COUHES review is not needed. */
export const ETHICS_REF: string = (env.VITE_ETHICS_APPROVAL_REF ?? '').trim()

/**
 * The study is LIVE when VITE_STUDY_MODE=live. Otherwise it stays in TEST mode:
 * a banner is shown and every record is flagged is_test.
 */
export const IS_LIVE = env.VITE_STUDY_MODE === 'live'
export const IS_TEST = !IS_LIVE

/** Contact details shown on the consent page (fill in before going live). */
export const STUDY_CONTACT: string = (env.VITE_STUDY_CONTACT ?? '').trim()
