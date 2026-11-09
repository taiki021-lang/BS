import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { HAS_SUPABASE, SUPABASE_ANON_KEY, SUPABASE_URL } from './env'
import type { Submission } from './types'

const LOCAL_KEY = 'invisible-fares:local-submissions'

let client: SupabaseClient | null = null
function sb(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  return client
}

export const BACKEND = HAS_SUPABASE ? 'supabase' : 'local'

/**
 * Claim the next permuted-block randomization slot from the server sequence.
 * Returns null (caller falls back to seed-based assignment) if unavailable or slow.
 */
export async function claimAssignmentSlot(isTest: boolean, timeoutMs = 4000): Promise<number | null> {
  if (!HAS_SUPABASE) return null
  try {
    const call = sb().rpc('claim_assignment_slot', { p_is_test: isTest })
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))
    const res = await Promise.race([call, timeout])
    if (!res || res.error || typeof res.data !== 'number' || res.data < 1) return null
    return res.data
  } catch {
    return null
  }
}

export interface ProgressEvent {
  participant_id: string
  design_version: string
  condition: string
  assignment_method: string
  is_test: boolean
  /** Screen reached, e.g. 'profile', 'task', 'estimate'. */
  step: string
  /** For 'task_done': index of the task just answered (0–9). */
  task_index?: number | null
}

/**
 * Anonymous progress log (insert-only), so drop-out can be compared between conditions.
 * Fire-and-forget: failures never block the participant.
 */
export function logProgress(ev: ProgressEvent): void {
  if (!HAS_SUPABASE) return
  void sb()
    .from('progress')
    .insert({ ...ev, task_index: ev.task_index ?? null })
    .then(
      () => undefined,
      () => undefined,
    )
}

/** Device-level marker that this browser already completed the study (repeat-participation guard). */
const DONE_KEY = 'invisible-fares:completed'
export function markCompleted(): void {
  try {
    localStorage.setItem(DONE_KEY, new Date().toISOString())
  } catch {
    /* ignore */
  }
}
export function hasCompletedBefore(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) !== null
  } catch {
    return false
  }
}

/**
 * Store one submission. With Supabase configured this is an INSERT-only call:
 * Row Level Security lets the anon key insert but never read, update or delete.
 * Without Supabase (local prototype) records go to this browser's localStorage.
 */
export async function saveSubmission(sub: Submission): Promise<void> {
  if (HAS_SUPABASE) {
    const { error } = await sb().from('responses').insert(sub)
    // 23505 = unique violation: this participant_id was already stored (e.g. a retry).
    if (error && error.code !== '23505') throw new Error(error.message)
    return
  }
  const all = loadLocalSubmissions().filter((s) => s.participant_id !== sub.participant_id)
  all.push(sub)
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all))
}

export function loadLocalSubmissions(): Submission[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as Submission[]
  } catch {
    return []
  }
}

export function clearLocalSubmissions(): void {
  localStorage.removeItem(LOCAL_KEY)
}

/** Researcher export via the server-side /api/export function (token required). */
export async function fetchRemoteSubmissions(token: string): Promise<Submission[]> {
  return fetchExport<Submission>(token, 'responses')
}

export type ProgressRow = ProgressEvent & { id: number; created_at: string }
export async function fetchRemoteProgress(token: string): Promise<ProgressRow[]> {
  return fetchExport<ProgressRow>(token, 'progress')
}

async function fetchExport<T>(token: string, table: 'responses' | 'progress'): Promise<T[]> {
  const res = await fetch(`/api/export?table=${table}`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) throw new Error('Wrong export token.')
  if (!res.ok) throw new Error(`Export failed (${res.status}): ${await res.text()}`)
  return (await res.json()) as T[]
}
