import { useState } from 'react'
import { balanceByCondition, choiceRows, participantRows, toCsv } from '../lib/csv'
import { IS_TEST } from '../lib/env'
import { newSeed } from '../lib/rng'
import { simulateSubmission } from '../lib/simulate'
import { BACKEND, clearLocalSubmissions, fetchRemoteProgress, fetchRemoteSubmissions, loadLocalSubmissions, saveSubmission, type ProgressRow } from '../lib/storage'
import type { Submission } from '../lib/types'
import { validateSubmission } from '../lib/validate'
import { Card, H1, Shell } from './kit'

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const btn = 'rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300'
const btn2 = 'rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold'

export function Admin() {
  const [token, setToken] = useState('')
  const [subs, setSubs] = useState<Submission[] | null>(BACKEND === 'local' ? loadLocalSubmissions() : null)
  const [progress, setProgress] = useState<ProgressRow[] | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setBusy(true)
    setMsg('')
    try {
      setSubs(BACKEND === 'local' ? loadLocalSubmissions() : await fetchRemoteSubmissions(token))
      if (BACKEND === 'supabase') setProgress(await fetchRemoteProgress(token))
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const simulate = async (n: number) => {
    setBusy(true)
    try {
      for (let i = 0; i < n; i++) await saveSubmission(simulateSubmission(newSeed(), crypto.randomUUID()))
      setMsg(`Stored ${n} simulated test submissions (is_simulated = true).`)
      if (BACKEND === 'local') setSubs(loadLocalSubmissions())
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const stats = subs && {
    total: subs.length,
    real: subs.filter((s) => !s.is_test && !s.is_simulated).length,
    test: subs.filter((s) => s.is_test && !s.is_simulated).length,
    simulated: subs.filter((s) => s.is_simulated).length,
    A: subs.filter((s) => s.condition === 'A').length,
    B: subs.filter((s) => s.condition === 'B').length,
    bad: subs.filter((s) => validateSubmission(s).length > 0).length,
  }

  // Drop-out by condition: participants who reached the game vs. who submitted.
  const attrition =
    progress &&
    (['A', 'B'] as const).map((c) => {
      const ids = (step: string) => new Set(progress.filter((e) => e.condition === c && e.step === step).map((e) => e.participant_id))
      return { condition: c, started: ids('profile').size, reached_game: ids('task').size, submitted: ids('done').size }
    })

  return (
    <Shell label="Researcher">
      <H1>Researcher export</H1>
      <p className="mb-4 text-sm text-slate-600">
        Storage backend: <strong>{BACKEND}</strong>.{' '}
        {BACKEND === 'local'
          ? 'Local prototype: responses live only in this browser.'
          : 'Responses are read through the server-side export function using your export token.'}
      </p>

      {BACKEND === 'supabase' && (
        <Card className="mb-4">
          <label className="mb-2 block text-sm font-medium" htmlFor="tok">
            Export token
          </label>
          <input
            id="tok"
            type="password"
            autoComplete="off"
            className="mb-3 w-full rounded-xl border border-slate-300 px-3 py-2.5"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button className={btn} disabled={!token || busy} onClick={load}>
            {busy ? 'Loading…' : 'Load responses'}
          </button>
        </Card>
      )}

      {msg && <p className="mb-4 rounded-xl bg-slate-200 p-3 text-sm">{msg}</p>}

      {stats && (
        <Card className="mb-4 text-sm">
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            {Object.entries(stats).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-slate-50 p-2">
                <div className="text-lg font-semibold">{v}</div>
                <div className="text-xs text-slate-500">{k === 'bad' ? 'integrity issues' : k}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btn} disabled={!subs.length} onClick={() => download(`participants_${stamp}.csv`, toCsv(participantRows(subs)))}>
              participants.csv
            </button>
            <button className={btn} disabled={!subs.length} onClick={() => download(`choices_long_${stamp}.csv`, toCsv(choiceRows(subs)))}>
              choices_long.csv
            </button>
            <button className={btn} disabled={!subs.length} onClick={() => download(`balance_${stamp}.csv`, toCsv(balanceByCondition(subs)))}>
              balance.csv
            </button>
            {progress && (
              <button className={btn} disabled={!progress.length} onClick={() => download(`progress_${stamp}.csv`, toCsv(progress as unknown as Parameters<typeof toCsv>[0]))}>
                progress.csv
              </button>
            )}
            {BACKEND === 'local' && (
              <button className={btn2} onClick={load}>
                Refresh
              </button>
            )}
          </div>
        </Card>
      )}

      {attrition && (
        <Card className="mb-4 text-sm">
          <h2 className="mb-2 font-semibold">Progress by condition (all rows, incl. test)</h2>
          <table className="w-full text-left">
            <thead className="text-xs text-slate-500">
              <tr><th>Cond.</th><th>Started</th><th>Reached game</th><th>Submitted</th></tr>
            </thead>
            <tbody>
              {attrition.map((r) => (
                <tr key={r.condition}><td>{r.condition}</td><td>{r.started}</td><td>{r.reached_game}</td><td>{r.submitted}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {IS_TEST && (
        <Card className="mb-4 text-sm">
          <h2 className="mb-1 font-semibold">Pipeline test (test mode only)</h2>
          <p className="mb-3 text-slate-600">
            Generates random, clearly flagged <code>is_simulated = true</code> records to check storage and export. They are
            not research data — exclude them from analysis.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className={btn2} disabled={busy} onClick={() => simulate(20)}>
              Simulate 20 submissions
            </button>
            {BACKEND === 'local' && (
              <button
                className={btn2}
                onClick={() => {
                  if (confirm('Delete all locally stored test submissions in this browser?')) {
                    clearLocalSubmissions()
                    setSubs([])
                  }
                }}
              >
                Clear local data
              </button>
            )}
          </div>
        </Card>
      )}
      <a href="#/" className="text-sm text-indigo-700 underline">
        ← Back to the study
      </a>
    </Shell>
  )
}
