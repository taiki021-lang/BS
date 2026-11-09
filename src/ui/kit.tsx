import type { ReactNode } from 'react'
import { IS_TEST } from '../lib/env'
import { BACKEND } from '../lib/storage'

export function Shell({ children, progress, label }: { children: ReactNode; progress?: number; label?: string }) {
  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900">
      {IS_TEST && (
        <div className="bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-amber-950">
          TEST MODE — not collecting research data · storage: {BACKEND}
        </div>
      )}
      <header className="sticky top-0 z-10 bg-indigo-700 text-white shadow">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/15 text-sm font-bold">M</span>
            <span className="font-semibold tracking-tight">Metro 2035</span>
          </div>
          {label && <span className="text-xs text-indigo-100">{label}</span>}
        </div>
        {progress !== undefined && (
          <div className="h-1 bg-indigo-900/40">
            <div className="h-1 bg-white transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </header>
      <main className="mx-auto max-w-md px-4 pb-28 pt-5">{children}</main>
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${className}`}>{children}</div>
}

export function H1({ children }: { children: ReactNode }) {
  return <h1 className="mb-3 text-2xl font-bold tracking-tight">{children}</h1>
}

/** Fixed bottom action bar. `onBack` adds a Back button (only offered before the game starts). */
export function BottomBar({ children, onBack }: { children: ReactNode; onBack?: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-md gap-2 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-base font-semibold text-slate-700 active:scale-[0.99]"
          >
            ← Back
          </button>
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}

export function PrimaryButton({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-xl bg-indigo-600 px-4 py-3.5 text-base font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      {children}
    </button>
  )
}

export function Question({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="mb-5">
      <legend className="mb-1 font-medium">{label}</legend>
      {hint && <p className="mb-2 text-sm text-slate-500">{hint}</p>}
      {children}
    </fieldset>
  )
}

export function Choices<T extends string>({ options, value, onChange, cols = 1 }: {
  options: readonly (T | { value: T; label: string })[]
  value: T | undefined
  onChange: (v: T) => void
  cols?: 1 | 2 | 3
}) {
  const grid = cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-2' : 'grid-cols-3'
  return (
    <div className={`grid gap-2 ${grid}`} role="radiogroup">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value
        const label = typeof o === 'string' ? o : o.label
        const on = v === value
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
              on ? 'border-indigo-600 bg-indigo-50 font-medium text-indigo-900 ring-1 ring-indigo-600' : 'border-slate-300 bg-white'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function Likert({ value, onChange, low, high }: { value: number | undefined; onChange: (v: number) => void; low: string; high: string }) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-2" role="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={`rounded-xl border py-2.5 text-sm font-medium ${
              value === n ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-600' : 'border-slate-300 bg-white'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  )
}

export function CrowdingMeter({ level }: { level: 'seated' | 'standing' | 'packed' }) {
  const n = { seated: 1, standing: 2, packed: 3 }[level]
  const label = { seated: 'Seat available', standing: 'Standing room', packed: 'Packed' }[level]
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <svg key={i} width="10" height="14" viewBox="0 0 10 14" className={i <= n ? 'fill-slate-700' : 'fill-slate-300'}>
            <circle cx="5" cy="3" r="2.5" />
            <rect x="1.5" y="6.5" width="7" height="7.5" rx="2" />
          </svg>
        ))}
      </span>
      <span>{label}</span>
    </span>
  )
}
