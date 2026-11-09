// Simulation-based power check for H1 (proposal §c: "confirm with a simulation-based power check before fielding").
//
// Uses the app's real task generator, simulates respondents with a mixed-logit data-generating process,
// fits a conditional (multinomial) logit with respondent-clustered standard errors, and reports how often the
// Condition × Fare interaction is significant (two-sided, alpha = 0.05).
//
// Run:  npm run power      (writes analysis/power-results.json and prints a table)
//
// ALL PARAMETER VALUES BELOW ARE ASSUMPTIONS for planning only — they are not data. Replace them with pilot
// estimates once real (non-test) responses exist.
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { generateDesign, type Task } from '../src/lib/design'
import { mulberry32 } from '../src/lib/rng'

// ---- Assumed data-generating process (utilities; peak option is the reference) ----
const TRUE = {
  ascEarly: Number(process.env.POWER_ASC_EARLY ?? -1.8),
  ascLate: Number(process.env.POWER_ASC_LATE ?? -2.1),
  shift60: -0.8, // extra disutility of a 60-min (vs 30-min) shift, early/late options
  crowdStanding: -0.4,
  crowdPacked: -1.0,
  fareA: Number(process.env.POWER_FARE_A ?? -1.0), // per US$ in condition A (fare visible)
}
const SD_FARE_LOG = 0.5 // individual heterogeneity: beta_i = beta * exp(N(0, sd) - sd^2/2)
const SD_SHIFT = 0.8 // individual propensity to shift (random intercept on all non-peak options)

const PARAMS = ['ascEarly', 'ascLate', 'shift60', 'crowdStanding', 'crowdPacked', 'fare', 'fareXB'] as const
const K = PARAMS.length

function normal(r: () => number): number {
  const u = Math.max(r(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r())
}

/** Design row for alternative a of task t, condition B flag. */
function xrow(t: Task, j: number, isB: boolean): number[] {
  const a = t.alternatives[j]
  const fare = a.fareCents / 100
  const shifted = a.kind === 'early' || a.kind === 'late'
  return [
    a.kind === 'early' ? 1 : 0,
    a.kind === 'late' ? 1 : 0,
    shifted && t.shiftMin === 60 ? 1 : 0,
    a.crowding === 'standing' ? 1 : 0,
    a.crowding === 'packed' ? 1 : 0,
    fare,
    isB ? fare : 0,
  ]
}

interface Obs {
  person: number
  X: number[][] // 3 x K
  y: number
}

function simulate(nPerGroup: number, attenuation: number, rng: () => number, seedBase: number): { obs: Obs[]; offpeak: number } {
  const obs: Obs[] = []
  let off = 0
  let n = 0
  for (let i = 0; i < 2 * nPerGroup; i++) {
    const isB = i % 2 === 1
    const design = generateDesign((seedBase + i * 7919) >>> 0, 495)
    const betaFare = TRUE.fareA * (isB ? 1 - attenuation : 1) * Math.exp(SD_FARE_LOG * normal(rng) - SD_FARE_LOG ** 2 / 2)
    const shiftRe = SD_SHIFT * normal(rng)
    for (const t of design.tasks) {
      const X = [0, 1, 2].map((j) => xrow(t, j, isB))
      const v = X.map((x, j) => {
        const fare = x[5]
        return (
          TRUE.ascEarly * x[0] + TRUE.ascLate * x[1] + TRUE.shift60 * x[2] +
          TRUE.crowdStanding * x[3] + TRUE.crowdPacked * x[4] + betaFare * fare + (j > 0 ? shiftRe : 0)
        )
      })
      // Gumbel errors -> logit choice
      const u = v.map((vj) => vj - Math.log(-Math.log(Math.max(rng(), 1e-12))))
      const y = u.indexOf(Math.max(...u))
      if (y === 1 || y === 2) off++
      n++
      obs.push({ person: i, X, y })
    }
  }
  return { obs, offpeak: off / n }
}

// ---- small dense linear algebra ----
function inv(A: number[][]): number[][] {
  const n = A.length
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    ;[M[c], M[p]] = [M[p], M[c]]
    const d = M[c][c]
    if (Math.abs(d) < 1e-12) throw new Error('singular')
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d
    for (let r = 0; r < n; r++)
      if (r !== c) {
        const f = M[r][c]
        if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]
      }
  }
  return M.map((r) => r.slice(n))
}

/** Conditional logit by Newton-Raphson; returns beta and cluster-robust (by person) covariance. */
function fitClogit(obs: Obs[]): { beta: number[]; se: number[] } {
  let beta = Array(K).fill(0)
  let H: number[][] = []
  for (let iter = 0; iter < 30; iter++) {
    const g = Array(K).fill(0)
    H = Array.from({ length: K }, () => Array(K).fill(0))
    for (const o of obs) {
      const e = o.X.map((x) => Math.exp(x.reduce((s, xk, k) => s + xk * beta[k], 0)))
      const S = e.reduce((a, b) => a + b, 0)
      const p = e.map((ej) => ej / S)
      const xbar = Array(K).fill(0)
      for (let j = 0; j < 3; j++) for (let k = 0; k < K; k++) xbar[k] += p[j] * o.X[j][k]
      for (let k = 0; k < K; k++) g[k] += o.X[o.y][k] - xbar[k]
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < K; k++) {
          const dk = o.X[j][k] - xbar[k]
          if (!dk) continue
          for (let l = 0; l < K; l++) H[k][l] -= p[j] * dk * (o.X[j][l] - xbar[l])
        }
    }
    const Hi = inv(H)
    const step = Hi.map((r) => -r.reduce((s, h, l) => s + h * g[l], 0))
    beta = beta.map((b, k) => b + step[k])
    if (Math.max(...step.map(Math.abs)) < 1e-8) break
  }
  // cluster-robust sandwich
  const Hi = inv(H)
  const scores = new Map<number, number[]>()
  for (const o of obs) {
    const e = o.X.map((x) => Math.exp(x.reduce((s, xk, k) => s + xk * beta[k], 0)))
    const S = e.reduce((a, b) => a + b, 0)
    const s = scores.get(o.person) ?? Array(K).fill(0)
    for (let k = 0; k < K; k++) {
      let xb = 0
      for (let j = 0; j < 3; j++) xb += (e[j] / S) * o.X[j][k]
      s[k] += o.X[o.y][k] - xb
    }
    scores.set(o.person, s)
  }
  const B = Array.from({ length: K }, () => Array(K).fill(0))
  for (const s of scores.values()) for (let k = 0; k < K; k++) for (let l = 0; l < K; l++) B[k][l] += s[k] * s[l]
  const G = scores.size
  const adj = G / (G - 1)
  // V = adj * Hi * B * Hi
  const V = Array.from({ length: K }, () => Array(K).fill(0))
  for (let i = 0; i < K; i++)
    for (let j = 0; j < K; j++) {
      let v = 0
      for (let k = 0; k < K; k++) for (let l = 0; l < K; l++) v += Hi[i][k] * B[k][l] * Hi[l][j]
      V[i][j] = adj * v
    }
  return { beta, se: V.map((r, i) => Math.sqrt(r[i])) }
}

it('power simulation for the Condition x Fare interaction', () => {
  const REPS = Number(process.env.POWER_REPS ?? 200)
  const sizes = [40, 60, 80]
  const attenuations = [0, 0.25, 0.4, 0.5, 0.75]
  const rng = mulberry32(20261106)
  const results: { nPerGroup: number; attenuation: number; power: number; meanFareXB: number; meanOffpeak: number }[] = []
  for (const n of sizes)
    for (const att of attenuations) {
      let hits = 0
      let sumB = 0
      let sumOff = 0
      for (let r = 0; r < REPS; r++) {
        const { obs, offpeak } = simulate(n, att, rng, 1000 + r * 104729 + n)
        const { beta, se } = fitClogit(obs)
        const z = beta[K - 1] / se[K - 1]
        if (Math.abs(z) > 1.959964) hits++
        sumB += beta[K - 1]
        sumOff += offpeak
      }
      results.push({ nPerGroup: n, attenuation: att, power: hits / REPS, meanFareXB: sumB / REPS, meanOffpeak: sumOff / REPS })
    }
  const out = { reps: REPS, assumptions: { ...TRUE, SD_FARE_LOG, SD_SHIFT }, params: PARAMS, results }
  writeFileSync(process.env.POWER_OUT ?? 'analysis/power-results.json', JSON.stringify(out, null, 1))
  console.table(results.map((r) => ({ ...r, power: r.power.toFixed(2), meanFareXB: r.meanFareXB.toFixed(3), meanOffpeak: r.meanOffpeak.toFixed(2) })))
}, 600_000)
