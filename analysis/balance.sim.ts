// Between-condition balance of task attributes: paired designs (current, block method) vs independent designs
// (seed fallback).
// Simulates many studies with 60 A + 60 B respondents and reports the typical (95th percentile) A–B difference.
// Run: npx vitest run --config vitest.power.config.ts analysis/balance.sim.ts
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { blockCondition, generateDesign, pairSeed, type Design } from '../src/lib/design'
import { mulberry32 } from '../src/lib/rng'

function summary(ds: Design[]) {
  let disc = 0, packed = 0, shift60 = 0, firstMon = 0, firstDisc45 = 0, n = 0
  for (const d of ds) {
    if (d.tasks[0].day === 'Monday') firstMon++
    if (d.tasks[0].alternatives[1].discountPct === 45) firstDisc45++
    for (const t of d.tasks) {
      n++
      disc += t.alternatives[1].discountPct
      if (t.peakCrowding === 'packed') packed++
      if (t.shiftMin === 60) shift60++
    }
  }
  return {
    meanTaskDiscountPct: disc / n,
    sharePeakPacked: packed / n,
    shareShift60: shift60 / n,
    shareFirstDayMonday: firstMon / ds.length,
    shareFirstTask45pct: firstDisc45 / ds.length,
  }
}

it('A/B balance at n = 60 per condition', () => {
  const STUDIES = 2000
  const r = mulberry32(42)
  const q = (xs: number[], p: number) => xs.slice().sort((x, y) => x - y)[Math.floor(p * (xs.length - 1))]
  const run = (paired: boolean) => {
    const diffs: Record<string, number[]> = {}
    for (let s = 0; s < STUDIES; s++) {
      let a: Design[], b: Design[]
      if (paired) {
        // 120 consecutive slots starting at a random block (as the live server sequence would give)
        const start = Math.floor(r() * 100000) * 4 + 1
        const slots = Array.from({ length: 120 }, (_, i) => start + i)
        a = slots.filter((x) => blockCondition(x) === 'A').map((x) => generateDesign(pairSeed(x), 495))
        b = slots.filter((x) => blockCondition(x) === 'B').map((x) => generateDesign(pairSeed(x), 495))
      } else {
        const mk = () => Array.from({ length: 60 }, () => generateDesign(Math.floor(r() * 2 ** 32), 495))
        a = mk()
        b = mk()
      }
      const sa = summary(a)
      const sb = summary(b)
      for (const k of Object.keys(sa) as (keyof typeof sa)[]) (diffs[k] ??= []).push(Math.abs(sa[k] - sb[k]))
    }
    return Object.fromEntries(Object.entries(diffs).map(([k, v]) => [k, { median: +q(v, 0.5).toFixed(4), p95: +q(v, 0.95).toFixed(4) }]))
  }
  const out = { paired_block_design: run(true), independent_designs: run(false) }
  writeFileSync(process.env.BALANCE_OUT ?? 'analysis/balance-results.json', JSON.stringify(out, null, 1))
})
