import { useEffect, useRef, useState } from 'react'
import { ALLOWANCE_CENTS, DESIGN_VERSION, NUM_TASKS } from './lib/config'
import { assignCondition, blockCondition, gameDepartureMin, generateDesign, pairSeed, type Condition, type Design } from './lib/design'
import { ETHICS_REF, IS_LIVE, IS_TEST } from './lib/env'
import { newSeed } from './lib/rng'
import { claimAssignmentSlot, logProgress, markCompleted, saveSubmission } from './lib/storage'
import type { ChoiceRecord, PostGame, Profile, Submission } from './lib/types'
import { sumChosen, validateSubmission } from './lib/validate'
import { Admin } from './ui/Admin'
import { Shell } from './ui/kit'
import {
  DoneScreen,
  EstimateScreen,
  FareRuleScreen,
  PostGameScreen,
  ProfileForm,
  RevealScreen,
  Scenario,
  TaskScreen,
  Welcome,
} from './ui/screens'

type Step = 'welcome' | 'profile' | 'scenario' | 'rule' | 'task' | 'estimate' | 'reveal' | 'post' | 'done'
const STEPS: Step[] = ['welcome', 'profile', 'scenario', 'rule', 'task', 'estimate', 'reveal', 'post', 'done']

interface State {
  step: Step
  participantId: string
  seed: number
  condition: Condition
  assignmentMethod: 'block' | 'seed'
  assignmentSlot: number | null
  /** True when ?seed= was used (test mode QA): keep seed-based assignment. */
  seedOverride: boolean
  startedAt: string
  profile?: Profile
  usualMin?: number
  design?: Design
  ruleCheckAttempts: number
  choices: ChoiceRecord[]
  estimateCents?: number
  estimateConfidence?: number
  estimateWarned?: boolean
  timings: Record<string, number>
}

const SESSION_KEY = 'invisible-fares:session:' + DESIGN_VERSION

function freshState(): State {
  // In TEST mode only, ?seed=123 reproduces a specific participant design for QA.
  const q = new URLSearchParams(location.search).get('seed')
  const override = Boolean(IS_TEST && q && /^\d+$/.test(q))
  const seed = override ? Number(q) >>> 0 : newSeed()
  return {
    step: 'welcome',
    participantId: crypto.randomUUID(),
    seed,
    // Provisional seed-based condition; replaced by a server block slot when the participant starts.
    condition: assignCondition(seed),
    assignmentMethod: 'seed',
    assignmentSlot: null,
    seedOverride: override,
    startedAt: new Date().toISOString(),
    ruleCheckAttempts: 0,
    choices: [],
    timings: {},
  }
}

function loadState(): State {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as State
      // Test mode: a different ?seed= in the URL starts a new QA session.
      const q = new URLSearchParams(location.search).get('seed')
      if (!(IS_TEST && q && Number(q) >>> 0 !== saved.seed)) return saved
    }
  } catch {
    /* ignore */
  }
  return freshState()
}

export default function App() {
  const [route, setRoute] = useState(location.hash)
  useEffect(() => {
    const f = () => setRoute(location.hash)
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  if (route.startsWith('#/admin')) return <Admin />
  return <Study />
}

function Study() {
  const [s, setS] = useState<State>(loadState)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  const [starting, setStarting] = useState(false)
  const enteredAt = useRef(performance.now())

  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
  }, [s])

  // Warn before leaving mid-survey (browser back gesture, closing the tab). Progress is kept for this tab.
  useEffect(() => {
    if (s.step === 'welcome' || s.step === 'done') return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [s.step])

  const track = (x: State, step: string, task_index?: number) =>
    logProgress({
      participant_id: x.participantId,
      design_version: DESIGN_VERSION,
      condition: x.condition,
      assignment_method: x.assignmentMethod,
      is_test: IS_TEST,
      step,
      task_index,
    })

  /** Consent given: claim a permuted-block slot (falls back to the seed) and start. */
  const start = async () => {
    if (starting) return
    setStarting(true)
    let patch: Partial<State> = { startedAt: new Date().toISOString() }
    if (!s.seedOverride && s.assignmentMethod !== 'block') {
      const slot = await claimAssignmentSlot(IS_TEST)
      // Paired design: the seed (and so the whole task set) is shared with the paired slot of the other condition.
      if (slot !== null) patch = { ...patch, assignmentMethod: 'block', assignmentSlot: slot, condition: blockCondition(slot), seed: pairSeed(slot) }
    }
    setStarting(false)
    track({ ...s, ...patch } as State, 'profile')
    go('profile', patch)
  }

  /** Move to the next step, accumulating time spent on the current one. */
  const go = (step: Step, patch: Partial<State> = {}) => {
    const now = performance.now()
    const spent = Math.round(now - enteredAt.current)
    enteredAt.current = now
    setS((x) => ({ ...x, ...patch, step, timings: { ...x.timings, [x.step]: (x.timings[x.step] ?? 0) + spent } }))
    // Log forward moves only (Back is not drop-out); 'profile' is logged in start(), 'done' after saving.
    const order = STEPS.indexOf(step)
    if (order > STEPS.indexOf(s.step) && step !== 'profile' && step !== 'done') track({ ...s, ...patch } as State, step)
    window.scrollTo(0, 0)
  }

  const submit = async (post: PostGame) => {
    if (!s.design || !s.profile || s.estimateCents === undefined) return
    setSubmitting(true)
    setError(undefined)
    const actual = sumChosen(s)
    const spent = Math.round(performance.now() - enteredAt.current)
    const sub: Submission = {
      participant_id: s.participantId,
      design_version: DESIGN_VERSION,
      seed: s.seed,
      condition: s.condition,
      assignment_method: s.assignmentMethod,
      assignment_slot: s.assignmentSlot,
      is_test: IS_TEST,
      is_simulated: false,
      ethics_ref: IS_LIVE && ETHICS_REF ? ETHICS_REF : null,
      started_at: s.startedAt,
      completed_at: new Date().toISOString(),
      profile: s.profile,
      design_usual_departure_min: s.usualMin!,
      fare_rule: s.design.fareRule,
      tasks: s.design.tasks,
      choices: s.choices,
      rule_check_attempts: s.ruleCheckAttempts,
      estimate_confidence: s.estimateConfidence!,
      estimated_total_cents: s.estimateCents,
      estimate_warning_shown: s.estimateWarned ?? false,
      actual_total_cents: actual,
      allowance_cents: ALLOWANCE_CENTS,
      remaining_cents: ALLOWANCE_CENTS - actual,
      post,
      timings: { ...s.timings, post: (s.timings.post ?? 0) + spent },
    }
    const problems = validateSubmission(sub)
    if (problems.length) console.warn('Integrity problems (record is still saved and flagged at export):', problems)
    try {
      await saveSubmission(sub)
      markCompleted()
      track(s, 'done')
      go('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const progress = (() => {
    if (s.step === 'task') return (STEPS.indexOf('task') + s.choices.length / NUM_TASKS) / (STEPS.length - 1)
    return STEPS.indexOf(s.step) / (STEPS.length - 1)
  })()

  let body
  switch (s.step) {
    case 'welcome':
      body = <Welcome onStart={start} starting={starting} />
      break
    case 'profile':
      body = (
        <ProfileForm
          initial={s.profile}
          onBack={() => go('welcome')}
          onDone={(profile) => {
            const usualMin = gameDepartureMin(profile.usual_departure_min)
            go('scenario', { profile, usualMin, design: generateDesign(s.seed, usualMin) })
          }}
        />
      )
      break
    case 'scenario':
      body = (
        <Scenario
          condition={s.condition}
          usualMin={s.usualMin!}
          reportedMin={s.profile?.usual_departure_min ?? null}
          workExperience={s.profile?.work_experience}
          onNext={() => go('rule')}
          onBack={() => go('profile')}
        />
      )
      break
    case 'rule':
      body = <FareRuleScreen design={s.design!} onDone={(n) => go('task', { ruleCheckAttempts: n })} onBack={() => go('scenario')} />
      break
    case 'task': {
      const task = s.design!.tasks[s.choices.length]
      body = (
        <TaskScreen
          key={task.index}
          task={task}
          condition={s.condition}
          usualMin={s.usualMin!}
          onChoose={(c) => {
            const choices = [...s.choices, c]
            track(s, 'task_done', c.task_index)
            if (choices.length < NUM_TASKS) setS((x) => ({ ...x, choices }))
            else go('estimate', { choices })
          }}
        />
      )
      break
    }
    case 'estimate':
      body = <EstimateScreen onDone={(c, conf, warned) => go('reveal', { estimateCents: c, estimateConfidence: conf, estimateWarned: warned })} />
      break
    case 'reveal':
      body = <RevealScreen estimate={s.estimateCents!} actual={sumChosen(s)} onNext={() => go('post')} />
      break
    case 'post':
      body = <PostGameScreen onDone={submit} submitting={submitting} error={error} />
      break
    case 'done':
      body = <DoneScreen participantId={s.participantId} />
      break
  }

  return (
    <Shell progress={progress} label={s.step === 'task' ? `Day ${s.choices.length + 1}/${NUM_TASKS}` : undefined}>
      {body}
    </Shell>
  )
}
