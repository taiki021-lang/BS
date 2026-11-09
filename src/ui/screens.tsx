import { useEffect, useRef, useState } from 'react'
import { ALLOWANCE_CENTS, DISCOUNT_LEVELS, ESTIMATE_CONFIRM_ABOVE_CENTS, GAME_DEPARTURE_MAX, GAME_DEPARTURE_MIN, NUM_TASKS, WEEKDAYS } from '../lib/config'
import {
  altTitle,
  costText,
  fareCents,
  formatMoney,
  formatTime,
  whenText,
  type AltKind,
  type Condition,
  type Design,
  type Task,
} from '../lib/design'
import { IS_LIVE, IS_TEST, STUDY_CONTACT } from '../lib/env'
import { DECISION_FACTOR_LABELS } from '../lib/csv'
import { hasCompletedBefore } from '../lib/storage'
import type { ChoiceRecord, PostGame, Profile } from '../lib/types'
import { BottomBar, Card, Choices, CrowdingMeter, H1, Likert, PrimaryButton, Question } from './kit'

/* ---------------------------------------------------------------- Welcome */

export function Welcome({ onStart, starting }: { onStart: () => void; starting?: boolean }) {
  const [age, setAge] = useState(false)
  const [consent, setConsent] = useState(false)
  const [repeat] = useState(hasCompletedBefore)
  if (repeat && IS_LIVE)
    return (
      <>
        <H1>Thank you!</H1>
        <Card className="text-sm leading-relaxed">
          It looks like this survey has already been completed on this device. Each person should take part only once,
          so there is nothing more to do. Thank you for your help!
        </Card>
      </>
    )
  return (
    <>
      <H1>The Commuting Game</H1>
      {repeat && (
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Test mode: this device has already completed the survey. In the live study this would be blocked.
        </p>
      )}
      <p className="mb-4 text-slate-600">
        A short research study about how people plan their commute when fares change by time and day. It takes about
        10 minutes.
      </p>
      <Card className="mb-4 space-y-3 text-sm leading-relaxed">
        <h2 className="font-semibold">About this study</h2>
        <p>What you will do:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Answer a few questions about your commute (about 3 minutes).</li>
          <li>
            Play a short game: imagine commuting in 2035 and choose <strong>when to leave home</strong> on ten office
            days (about 5 minutes).
          </li>
          <li>Answer a few questions about the game (about 2 minutes).</li>
        </ol>
        <p>We want to learn how people decide when to travel. There are no right or wrong answers.</p>
        <p>
          <strong>Anonymous.</strong> We do not ask for your name, email or any contact details. Your answers are stored
          under a random ID and used only for research. Because they are anonymous, answers cannot be withdrawn after you
          submit.
        </p>
        <p>
          <strong>AI comparison.</strong> Your anonymous answers (with no identifying information) may be processed by an
          AI model to create simulated commuters, whose choices we compare with people’s choices.
        </p>
        <p>
          <strong>Voluntary.</strong> You can stop at any time by closing this page. Your answers are saved only if you
          finish. To see where people stop, we do record anonymously how far you got (for example, “reached day 4”).
        </p>
        {IS_TEST && (
          <p>
            <strong>Test version.</strong> Answers given now are used only to check the survey, not for the study.
          </p>
        )}
        {STUDY_CONTACT && (
          <p>
            <strong>Questions:</strong> {STUDY_CONTACT}
          </p>
        )}
      </Card>
      <Card className="mb-4 space-y-3">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-indigo-600" checked={age} onChange={(e) => setAge(e.target.checked)} />
          <span>I am 18 years of age or older.</span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-indigo-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>I have read the information above and agree to take part.</span>
        </label>
      </Card>
      <BottomBar>
        <PrimaryButton disabled={!age || !consent || starting} onClick={onStart}>
          {starting ? 'Starting…' : 'Start'}
        </PrimaryButton>
      </BottomBar>
    </>
  )
}

/* ---------------------------------------------------------------- Profile */

const TIME_OPTIONS = Array.from({ length: 25 }, (_, i) => 5 * 60 + i * 15) // 5:00–11:00

const WORK_EXPERIENCE = ['I currently work full-time', 'I previously worked full-time', 'I have never worked full-time'] as const
const TRANSIT_PAYMENT = ['Monthly or unlimited pass', 'Pay per trip (card or phone tap)', 'Pass provided by my employer or school', 'Paper ticket or cash', 'Did not use public transit'] as const
const KNEW_FARE = ['Yes, exactly', 'Roughly', 'No', 'Not applicable'] as const
const MORNING_CONSTRAINT = ['Yes, usually', 'Sometimes', 'No'] as const
const CURRENT_ROLE = ['MIT staff or faculty', 'Sloan Fellow', 'MBA student', 'Other MIT student', 'Other', 'Prefer not to say'] as const
const JOB_REGION = ['United States / Canada', 'Latin America', 'Europe', 'East Asia', 'South / Southeast Asia', 'Middle East / Africa', 'Oceania', 'Prefer not to say'] as const
const COMMUTE_TIME_BANDS = ['Under 15 min', '15–29 min', '30–44 min', '45–59 min', '60–89 min', '90+ min'] as const
const LAST_FULLTIME = ['Within the past year', '1–3 years ago', 'More than 3 years ago'] as const

/** Turn a saved profile back into form values (used when returning with Back). */
function profileToForm(x?: Profile): Partial<Record<keyof Profile, string>> {
  if (!x) return {}
  return {
    ...x,
    last_fulltime: x.last_fulltime && x.last_fulltime !== 'Currently' ? x.last_fulltime : undefined,
    commute_payer: x.commute_payer ?? undefined,
    usual_departure_min: x.usual_departure_min === null ? 'none' : String(x.usual_departure_min),
    monthly_commute_spend_cents: x.monthly_commute_spend_cents === null ? 'unknown' : String(x.monthly_commute_spend_cents / 100),
  }
}

export function ProfileForm({ initial, onDone, onBack }: { initial?: Profile; onDone: (p: Profile) => void; onBack: () => void }) {
  const [p, setP] = useState<Partial<Record<keyof Profile, string>>>(() => profileToForm(initial))
  const set = (k: keyof Profile) => (v: string) => setP((x) => ({ ...x, [k]: v }))
  const current = p.work_experience === WORK_EXPERIENCE[0]
  const previous = p.work_experience === WORK_EXPERIENCE[1]
  const never = p.work_experience === WORK_EXPERIENCE[2]
  // Past tense for a previous job, present tense otherwise.
  const did = previous ? 'did' : 'do'
  const job = never ? 'your current main routine (for example classes or part-time work)' : current ? 'your current full-time job' : 'your most recent full-time job'
  const spendOk = p.monthly_commute_spend_cents === 'unknown' || (p.monthly_commute_spend_cents ?? '') !== ''
  const complete =
    p.work_experience &&
    (!previous || p.last_fulltime) &&
    p.office_days_per_week &&
    p.choose_office_days &&
    p.commute_mode &&
    p.commute_time_band &&
    (never || p.commute_payer) &&
    p.transit_payment &&
    p.knew_fare &&
    p.morning_constraint &&
    p.current_role &&
    p.job_region &&
    p.start_time_flexibility &&
    p.usual_departure_min &&
    spendOk &&
    p.age_band
  return (
    <>
      <H1>Your commuting experience</H1>
      <p className="mb-5 text-sm text-slate-600">
        For this survey, we’d like you to think about your <strong>most recent full-time job</strong>, rather than your
        current student life. If you are currently working full-time, please answer based on your current job.
      </p>
      <Question
        label="Which best describes your work experience?"
        hint="Not counting your current studies. If you are on leave from your job to study (for example as a sponsored Sloan Fellow), choose “I previously worked full-time” and think about that job."
      >
        <Choices
          options={[...WORK_EXPERIENCE]}
          value={p.work_experience}
          onChange={(v) => setP((x) => ({ ...x, work_experience: v, last_fulltime: undefined }))}
          cols={1}
        />
      </Question>
      {previous && (
        <Question label="When did you last work full-time?">
          <Choices options={[...LAST_FULLTIME]} value={p.last_fulltime} onChange={set('last_fulltime')} cols={1} />
        </Question>
      )}
      {p.work_experience && (
        <>
          <Card className="mb-5 bg-slate-50 text-sm">
            For the following questions, think about <strong>{job}</strong>.
          </Card>
          <Question label={`In a typical week, how many days ${did} you go to your ${never ? 'workplace or campus' : 'workplace'}?`}>
            <Choices options={['0 days', '1 day', '2 days', '3 days', '4 days', '5+ days']} value={p.office_days_per_week} onChange={set('office_days_per_week')} cols={3} />
          </Question>
          <Question label={`${previous ? 'Could' : 'Can'} you choose which days to go to your ${never ? 'workplace or campus' : 'workplace'}?`}>
            <Choices options={['Yes, fully', 'Partly', 'No']} value={p.choose_office_days} onChange={set('choose_office_days')} cols={3} />
          </Question>
          <Question label={`How ${did} you usually get there?`}>
            <Choices options={['Subway / rail', 'Bus', 'Car', 'Company shuttle', 'Taxi / ride-hail', 'Bike / walk', 'Other']} value={p.commute_mode} onChange={set('commute_mode')} cols={2} />
          </Question>
          <Question label={`About how long ${previous ? 'was' : 'is'} your typical one-way commute, door to door?`}>
            <Choices options={[...COMMUTE_TIME_BANDS]} value={p.commute_time_band} onChange={set('commute_time_band')} cols={3} />
          </Question>
          <Question label={`How flexible ${previous ? 'was' : 'is'} the time you start${previous ? 'ed' : ''} work${never ? ' or classes' : ''}?`}>
            <Choices options={['Not flexible', 'Somewhat flexible', 'Very flexible']} value={p.start_time_flexibility} onChange={set('start_time_flexibility')} cols={3} />
          </Question>
          <Question label={`${previous ? 'Did' : 'Do'} morning responsibilities (for example, school drop-off) fix when you ${previous ? 'could' : 'can'} leave home?`}>
            <Choices options={[...MORNING_CONSTRAINT]} value={p.morning_constraint} onChange={set('morning_constraint')} cols={3} />
          </Question>
          <Question label={`What time ${did} you usually leave home?`} hint="The game will use this as your usual departure time.">
            <select
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3"
              value={p.usual_departure_min ?? ''}
              onChange={(e) => set('usual_departure_min')(e.target.value)}
            >
              <option value="" disabled>
                Select a time…
              </option>
              {TIME_OPTIONS.map((m) => (
                <option key={m} value={String(m)}>
                  {formatTime(m)}
                </option>
              ))}
              <option value="none">No regular time</option>
            </select>
          </Question>
          {!never && (
            <Question label={`Who ${previous ? 'paid' : 'pays'} for your commuting?`}>
              <Choices
                options={['My employer paid all of it', 'My employer paid part of it', 'I paid all of it', 'Not sure']}
                value={p.commute_payer}
                onChange={set('commute_payer')}
                cols={1}
              />
            </Question>
          )}
          <Question label={`How ${did} you usually pay for public transit?`}>
            <Choices options={[...TRANSIT_PAYMENT]} value={p.transit_payment} onChange={set('transit_payment')} cols={1} />
          </Question>
          <Question label={`${previous ? 'Did' : 'Do'} you know the fare for one trip on your usual commute?`}>
            <Choices options={[...KNEW_FARE]} value={p.knew_fare} onChange={set('knew_fare')} cols={2} />
          </Question>
          <Question
            label={`About how much ${previous ? 'did' : 'does'} commuting cost in total per month?`}
            hint="Include any part your employer paid. Roughly converted to US dollars; a rough guess is fine."
          >
            <div className="flex items-center gap-2">
              <span className="text-slate-500">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={2000}
                disabled={p.monthly_commute_spend_cents === 'unknown'}
                className="w-32 rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-100"
                value={p.monthly_commute_spend_cents === 'unknown' ? '' : (p.monthly_commute_spend_cents ?? '')}
                onChange={(e) => set('monthly_commute_spend_cents')(e.target.value)}
              />
              <label className="ml-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-indigo-600"
                  checked={p.monthly_commute_spend_cents === 'unknown'}
                  onChange={(e) => set('monthly_commute_spend_cents')(e.target.checked ? 'unknown' : '')}
                />
                Don’t know
              </label>
            </div>
          </Question>
          <Card className="mb-5 bg-slate-50 text-sm">
            <strong>About you.</strong> Broad categories only; you can choose “Prefer not to say”.
          </Card>
          <Question label="Which best describes you now?">
            <Choices options={[...CURRENT_ROLE]} value={p.current_role} onChange={set('current_role')} cols={2} />
          </Question>
          <Question label={never ? 'Where do you live?' : `Where ${previous ? 'was' : 'is'} that job located?`}>
            <Choices options={[...JOB_REGION]} value={p.job_region} onChange={set('job_region')} cols={2} />
          </Question>
          <Question label="Your age group">
            <Choices options={['18–24', '25–34', '35–44', '45–54', '55–64', '65+', 'Prefer not to say']} value={p.age_band} onChange={set('age_band')} cols={3} />
          </Question>
        </>
      )}
      <BottomBar onBack={onBack}>
        <PrimaryButton
          disabled={!complete}
          onClick={() =>
            onDone({
              work_experience: p.work_experience!,
              last_fulltime: current ? 'Currently' : previous ? p.last_fulltime! : null,
              office_days_per_week: p.office_days_per_week!,
              choose_office_days: p.choose_office_days!,
              commute_mode: p.commute_mode!,
              commute_time_band: p.commute_time_band!,
              commute_payer: never ? null : p.commute_payer!,
              transit_payment: p.transit_payment!,
              knew_fare: p.knew_fare!,
              morning_constraint: p.morning_constraint!,
              current_role: p.current_role!,
              job_region: p.job_region!,
              start_time_flexibility: p.start_time_flexibility!,
              usual_departure_min: p.usual_departure_min === 'none' ? null : Number(p.usual_departure_min),
              monthly_commute_spend_cents:
                p.monthly_commute_spend_cents === 'unknown' ? null : Math.round(Math.max(0, Number(p.monthly_commute_spend_cents)) * 100),
              age_band: p.age_band!,
            })
          }
        >
          Continue
        </PrimaryButton>
      </BottomBar>
    </>
  )
}

/* ---------------------------------------------------------------- Scenario */

export function Scenario({ condition, usualMin, reportedMin, workExperience, onNext, onBack }: {
  condition: Condition
  usualMin: number
  /** Departure time the participant reported (null = no regular time). */
  reportedMin: number | null
  workExperience?: string
  onNext: () => void
  onBack: () => void
}) {
  const clamped = reportedMin !== null && reportedMin !== usualMin
  const items = [
    ['🚇', 'Gateless rail', 'You walk straight through the station. No tapping, no tickets.'],
    ['🕗', 'Fares change by time and day', 'Trips in the busy peak cost more; off-peak trips are discounted.'],
    ['💵', `A ${formatMoney(ALLOWANCE_CENTS)} commuting allowance`, `Your employer gives you ${formatMoney(ALLOWANCE_CENTS)} for the ten office days in this game. Whatever you don’t spend on fares, you keep.`],
    ['🏠', 'Hybrid work', 'You work a hybrid schedule. In this game your office days are already set; you only decide when to travel on each of them. Please use this setting even if your past job was different.'],
  ]
  return (
    <>
      <H1>It’s 2035</H1>
      <p className="mb-4 text-slate-600">
        Imagine commuting in{' '}
        {workExperience === WORK_EXPERIENCE[0] ? 'the city where you work' : workExperience === WORK_EXPERIENCE[2] ? 'the city where you live now' : 'the city where you last worked full-time'}, in 2035:
      </p>
      <div className="mb-4 space-y-2">
        {items.map(([icon, title, body]) => (
          <Card key={title} className="flex gap-3">
            <span className="text-2xl" aria-hidden>
              {icon}
            </span>
            <div>
              <div className="font-semibold">{title}</div>
              <div className="text-sm text-slate-600">{body}</div>
            </div>
          </Card>
        ))}
      </div>
      <Card className="mb-4 text-sm leading-relaxed">
        <h2 className="mb-2 text-base font-semibold">How the game works</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            You will see <strong>ten office days</strong>, one screen at a time. They come from different weeks, so treat
            each day on its own.
          </li>
          <li>
            On each day, pick <strong>when to leave home</strong>:
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>
                at your usual time (<strong>{formatTime(usualMin)}</strong>), which is the busy <strong>peak</strong>,
              </li>
              <li>
                <strong>earlier</strong>, off-peak, or
              </li>
              <li>
                <strong>later</strong>, off-peak.
              </li>
            </ul>
          </li>
          <li>
            Each choice has a downside, such as getting up earlier, being late for a meeting, or a more crowded train.
            Off-peak fares depend on the day of the week (you will see the fare rule next).
          </li>
          <li>
            <strong>Fares:</strong>{' '}
            {condition === 'A' ? 'the fare for each option is shown on screen when you choose.' : 'fares are not shown when you choose.'}{' '}
            At the end you will see your total bill. Your remaining allowance is not shown during the game.
          </li>
          <li>There is no score. Choose what you would really do.</li>
        </ol>
        {clamped && (
          <p className="mt-3 text-slate-600">
            Your usual time was set to {formatTime(usualMin)} because the game uses departure times between{' '}
            {formatTime(GAME_DEPARTURE_MIN)} and {formatTime(GAME_DEPARTURE_MAX)}.
          </p>
        )}
      </Card>
      <BottomBar onBack={onBack}>
        <PrimaryButton onClick={onNext}>See the fare rule</PrimaryButton>
      </BottomBar>
    </>
  )
}

/* ---------------------------------------------------------------- Fare rule */

export function FareRuleScreen({ design, onDone, onBack }: { design: Design; onDone: (attempts: number) => void; onBack: () => void }) {
  const checkDay = WEEKDAYS.reduce((best, d) => (design.fareRule[d] > design.fareRule[best] ? d : best), WEEKDAYS[0])
  const correct = fareCents(design.fareRule[checkDay], false)
  const [answer, setAnswer] = useState<string>()
  const [attempts, setAttempts] = useState(0)
  const [wrong, setWrong] = useState(false)
  const options = DISCOUNT_LEVELS.map((d) => formatMoney(fareCents(d, false)))
  return (
    <>
      <H1>The 2035 fare rule</H1>
      <Card className="mb-4 text-sm leading-relaxed">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Peak trips</strong> (leaving at your usual, busy time) cost <strong>{formatMoney(fareCents(0, true))}</strong> every day.
          </li>
          <li>
            <strong>Off-peak trips</strong> (leaving earlier or later than the busy period) get a discount that depends on the <strong>day of the week</strong>.
          </li>
          <li>Each office day is billed as one trip.</li>
        </ul>
      </Card>
      <Card className="mb-4 overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Day</th>
              <th className="px-3 py-2">Peak</th>
              <th className="px-3 py-2">Off-peak discount</th>
              <th className="px-3 py-2">Off-peak fare</th>
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((d) => (
              <tr key={d} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{d}</td>
                <td className="px-3 py-2">{formatMoney(fareCents(0, true))}</td>
                <td className="px-3 py-2">{design.fareRule[d]}%</td>
                <td className="px-3 py-2">{formatMoney(fareCents(design.fareRule[d], false))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mb-4 text-sm text-slate-600">Take a moment to learn this rule. You won’t be able to come back to this table during the game.</p>
      <Card className="mb-4">
        <Question label={`Quick check: what does an off-peak trip on ${checkDay} cost?`}>
          <Choices options={options} value={answer} onChange={(v) => { setAnswer(v); setWrong(false) }} cols={2} />
        </Question>
        {wrong && <p className="text-sm text-rose-700">Not quite. Look at the table above and try again.</p>}
      </Card>
      <Card className="mb-4 text-sm leading-relaxed">
        <h2 className="mb-1 font-semibold">Before you start</h2>
        <ul className="list-disc space-y-1 pl-5 text-slate-700">
          <li>Each of the ten days is from a different week. Treat each day on its own.</li>
          <li>Your office days are fixed. You only choose when to leave home.</li>
          <li>Leaving at your usual time is peak. Earlier or later is off-peak.</li>
          <li>There are no right answers. Choose what you would really do.</li>
        </ul>
        <p className="mt-2 text-slate-600">A short reminder of these points is shown on every day.</p>
      </Card>
      <BottomBar onBack={onBack}>
        <PrimaryButton
          disabled={!answer}
          onClick={() => {
            const n = attempts + 1
            setAttempts(n)
            if (answer === formatMoney(correct)) onDone(n)
            else setWrong(true)
          }}
        >
          Start planning
        </PrimaryButton>
      </BottomBar>
    </>
  )
}

/* ---------------------------------------------------------------- Choice task */

export function TaskScreen({ task, condition, usualMin, onChoose }: {
  task: Task
  condition: Condition
  usualMin: number
  onChoose: (c: ChoiceRecord) => void
}) {
  const [sel, setSel] = useState<AltKind>()
  const changes = useRef(0)
  const shownAt = useRef({ wall: new Date().toISOString(), t: performance.now() })
  useEffect(() => {
    shownAt.current = { wall: new Date().toISOString(), t: performance.now() }
    changes.current = 0
    window.scrollTo(0, 0)
  }, [task.index])
  return (
    <>
      {/* Day counter: always visible at the top of each office day */}
      <div className="mb-2 flex items-end justify-between">
        <div className="leading-none">
          <span className="text-3xl font-bold text-indigo-700 tabular-nums">Day {task.index + 1}</span>
          <span className="ml-1 text-base font-medium text-slate-500">of {NUM_TASKS}</span>
        </div>
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-800">{task.day}</span>
      </div>
      <div className="mb-3 flex items-center gap-1" aria-hidden>
        {Array.from({ length: NUM_TASKS }, (_, i) => (
          <div
            key={i}
            className={`h-2.5 flex-1 rounded-full ${i < task.index ? 'bg-indigo-600' : i === task.index ? 'bg-indigo-300 ring-2 ring-indigo-600' : 'bg-slate-200'}`}
          />
        ))}
      </div>

      {/* Morning story: same template every day (no extra information beyond the options) */}
      <div className="mb-3 flex items-center gap-3 rounded-2xl bg-indigo-50 px-3 py-2.5">
        <div className="flex shrink-0 flex-col items-center text-lg leading-tight" aria-hidden>
          <span>🏠</span>
          <span>🚆</span>
          <span>🏢</span>
        </div>
        <p className="text-sm leading-snug text-indigo-950">
          <strong>{task.day} morning.</strong> Your team has a meeting first thing in the morning. You usually leave home
          at <strong>{formatTime(usualMin)}</strong> <strong>When do you leave?</strong>
        </p>
      </div>
      {/* Rules reminder: identical in A and B; never mentions fares, discounts or the allowance. */}
      <p className="mb-3 text-xs leading-snug text-slate-600">
        Reminder: each day is separate · your office days are fixed, you only choose when to leave · there are no right
        answers.
      </p>
      <div className="space-y-2">
        {task.alternatives.map((a) => {
          const on = sel === a.kind
          return (
            <button
              key={a.kind}
              type="button"
              aria-pressed={on}
              onClick={() => {
                if (sel && sel !== a.kind) changes.current += 1
                setSel(a.kind)
              }}
              className={`w-full rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 transition ${on ? 'ring-2 ring-indigo-600' : 'ring-slate-200'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-indigo-600' : 'border-slate-300'}`}>
                    {on && <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xl font-bold tabular-nums leading-tight">{formatTime(a.departMin)}</div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{altTitle(a.kind)}</div>
                  </div>
                </div>
                {condition === 'A' && (
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-semibold tabular-nums">{formatMoney(a.fareCents)}</div>
                    <div className="text-[11px] text-slate-500">fare</div>
                  </div>
                )}
              </div>
              <div className="mt-2 grid gap-1 text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs text-slate-500">Your day</span>
                  <span>{costText(task, a.kind)}</span>
                </div>
                <span className="sr-only">{whenText(task, a, usualMin)}</span>
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs text-slate-500">Crowding</span>
                  <CrowdingMeter level={a.crowding} />
                </div>
              </div>
            </button>
          )
        })}
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">
        Fares are billed at the end using the fare rule.{condition === 'A' && ' The fare for each option is shown above.'}
      </p>
      <BottomBar>
        <PrimaryButton
          disabled={!sel}
          onClick={() => {
            const alt = task.alternatives.find((x) => x.kind === sel)!
            onChoose({
              task_index: task.index,
              day: task.day,
              chosen_kind: alt.kind,
              chosen_fare_cents: alt.fareCents,
              shown_at: shownAt.current.wall,
              answered_at: new Date().toISOString(),
              duration_ms: Math.round(performance.now() - shownAt.current.t),
              selection_changes: changes.current,
            })
            setSel(undefined)
          }}
        >
          {task.index + 1 < NUM_TASKS ? 'Confirm and continue' : 'Confirm last day'}
        </PrimaryButton>
      </BottomBar>
    </>
  )
}

/* ---------------------------------------------------------------- Estimate */

export function EstimateScreen({ onDone }: { onDone: (cents: number, confidence: number, warned: boolean) => void }) {
  const [v, setV] = useState('')
  const [conf, setConf] = useState<number>()
  /** Estimate (cents) for which the high-value confirmation is currently showing. */
  const [confirming, setConfirming] = useState<number>()
  const [warned, setWarned] = useState(false)
  const n = Number(v)
  const ok = v !== '' && Number.isFinite(n) && n >= 0 && n <= 1000 && conf
  return (
    <>
      <H1>All ten days planned</H1>
      <p className="mb-5 text-slate-600">Before you see your bill, please make your best guess.</p>
      <Card className="mb-4">
        <Question label="How much do you think your ten trips cost in total?" hint="Without looking anything up. A rough guess is fine.">
          <div className="flex items-center gap-2 text-2xl">
            <span className="text-slate-500">$</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              autoFocus
              className="w-40 rounded-xl border border-slate-300 px-3 py-2 text-2xl tabular-nums"
              value={v}
              onChange={(e) => {
                setV(e.target.value)
                setConfirming(undefined)
              }}
            />
          </div>
        </Question>
        <Question label="How confident are you in this guess?">
          <Likert value={conf} onChange={setConf} low="Not at all" high="Very" />
        </Question>
        {confirming !== undefined && (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            You entered <strong>{formatMoney(confirming)}</strong> as the total fare for your ten trips. Is that what you
            meant? Tap the button again to confirm, or change your answer.
          </p>
        )}
      </Card>
      <BottomBar>
        <PrimaryButton
          disabled={!ok}
          onClick={() => {
            const cents = Math.round(n * 100)
            if (cents > ESTIMATE_CONFIRM_ABOVE_CENTS && confirming !== cents) {
              setConfirming(cents)
              setWarned(true)
              return
            }
            onDone(cents, conf!, warned)
          }}
        >
          {confirming !== undefined ? 'Yes, show my bill' : 'Show my bill'}
        </PrimaryButton>
      </BottomBar>
    </>
  )
}

/* ---------------------------------------------------------------- Reveal */

export function RevealScreen({ estimate, actual, onNext }: { estimate: number; actual: number; onNext: () => void }) {
  return (
    <>
      <H1>Your bill</H1>
      <Card className="mb-4">
        <div className="text-sm text-slate-500">Fares for your ten office days</div>
        <div className="mb-4 text-4xl font-bold tabular-nums">{formatMoney(actual)}</div>
        <div className="space-y-2 border-t border-slate-100 pt-3 text-sm">
          <Row label="Commuting allowance" value={formatMoney(ALLOWANCE_CENTS)} />
          <Row label="Fares billed" value={`− ${formatMoney(actual)}`} />
          <Row label="You keep" value={formatMoney(ALLOWANCE_CENTS - actual)} strong />
        </div>
      </Card>
      <Card className="mb-4 text-sm">
        <Row label="Your estimate" value={formatMoney(estimate)} />
      </Card>
      <BottomBar>
        <PrimaryButton onClick={onNext}>A few last questions</PrimaryButton>
      </BottomBar>
    </>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'text-base font-semibold' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

/* ---------------------------------------------------------------- Post-game */

export function PostGameScreen({ onDone, submitting, error }: { onDone: (p: PostGame) => void; submitting: boolean; error?: string }) {
  const [recall, setRecall] = useState<Partial<Record<string, string>>>({})
  const [p, setP] = useState<Partial<PostGame>>({})
  const recallDone = WEEKDAYS.every((d) => recall[d])
  const complete =
    recallDone &&
    p.fares_shown_check &&
    (p.decision_factors?.length ?? 0) > 0 &&
    p.tracked_allowance &&
    p.fare_influence &&
    p.ai_trust &&
    p.ai_delegate &&
    p.fairness_peak_pricing &&
    p.fairness_day_varying &&
    p.day_switch &&
    p.taken_before
  return (
    <>
      <H1>About the game</H1>
      <p className="mb-3 text-sm text-slate-600">First, a few questions about the game you just played.</p>
      <Card className="mb-4">
        <Question label="From memory: what was the off-peak discount on each day?" hint="Choose “?” if you are not sure.">
          <div className="space-y-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-sm font-medium">{d.slice(0, 3)}</span>
                <div className="grid flex-1 grid-cols-5 gap-1">
                  {['0', '15', '30', '45', 'unsure'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setRecall((r) => ({ ...r, [d]: v }))}
                      className={`rounded-lg border py-2 text-xs ${recall[d] === v ? 'border-indigo-600 bg-indigo-50 font-semibold ring-1 ring-indigo-600' : 'border-slate-300 bg-white'}`}
                    >
                      {v === 'unsure' ? '?' : `${v}%`}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Question>
      </Card>
      <Card className="mb-4">
        <Question label="During the game, were fares shown next to each option?">
          <Choices options={['Yes', 'No', 'Not sure']} value={p.fares_shown_check} onChange={(v) => setP((x) => ({ ...x, fares_shown_check: v }))} cols={3} />
        </Question>
        <Question label="What mattered most in your choices?" hint="Choose up to two.">
          <div className="grid grid-cols-1 gap-2" role="group">
            {DECISION_FACTOR_LABELS.map((f) => {
              const sel = p.decision_factors ?? []
              const on = sel.includes(f)
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && sel.length >= 2}
                  onClick={() =>
                    setP((x) => {
                      const cur = x.decision_factors ?? []
                      return { ...x, decision_factors: cur.includes(f) ? cur.filter((y) => y !== f) : cur.length < 2 ? [...cur, f] : cur }
                    })
                  }
                  className={`rounded-xl border px-3 py-2.5 text-left text-sm disabled:opacity-40 ${on ? 'border-indigo-600 bg-indigo-50 font-semibold ring-1 ring-indigo-600' : 'border-slate-300 bg-white'}`}
                >
                  {f}
                </button>
              )
            })}
          </div>
        </Question>
        <Question label="During the game, did you keep track of how much of your allowance you were spending?">
          <Choices options={['Yes, closely', 'Roughly', 'Not at all']} value={p.tracked_allowance} onChange={(v) => setP((x) => ({ ...x, tracked_allowance: v }))} cols={3} />
        </Question>
        <Question label="How much did fares influence your choices?">
          <Likert value={p.fare_influence} onChange={(v) => setP((x) => ({ ...x, fare_influence: v }))} low="Not at all" high="A lot" />
        </Question>
      </Card>
      <h2 className="mb-1 mt-6 text-lg font-semibold">Your opinions</h2>
      <p className="mb-3 text-sm text-slate-600">These questions are about your general views, not about the game. There are no right answers.</p>
      <Card className="mb-4">
        <Question label="Imagine a future AI travel assistant (not part of this game) that plans your commute around fares. How much would you trust its plan?">
          <Likert value={p.ai_trust} onChange={(v) => setP((x) => ({ ...x, ai_trust: v }))} low="Not at all" high="Completely" />
        </Question>
        <Question label="Would you let it choose your departure times automatically?">
          <Choices options={['Yes', 'Maybe', 'No']} value={p.ai_delegate} onChange={(v) => setP((x) => ({ ...x, ai_delegate: v }))} cols={3} />
        </Question>
      </Card>
      <Card className="mb-4">
        <Question label="Charging more for travel at peak times is fair.">
          <Likert value={p.fairness_peak_pricing} onChange={(v) => setP((x) => ({ ...x, fairness_peak_pricing: v }))} low="Strongly disagree" high="Strongly agree" />
        </Question>
        <Question label="Fares that change by day of the week are fair.">
          <Likert value={p.fairness_day_varying} onChange={(v) => setP((x) => ({ ...x, fairness_day_varying: v }))} low="Strongly disagree" high="Strongly agree" />
        </Question>
        <Question label="Suppose one of your office days had no off-peak discount, but another weekday that same week had a 45% off-peak discount. Would you move your office day to the cheaper day?">
          <Choices
            options={['Yes', 'Maybe', 'No', 'I can’t choose my office days']}
            value={p.day_switch}
            onChange={(v) => setP((x) => ({ ...x, day_switch: v }))}
            cols={2}
          />
        </Question>
      </Card>
      <Card className="mb-4">
        <Question label="Have you taken part in this survey before (on any device)?">
          <Choices options={['No', 'Yes', 'Not sure']} value={p.taken_before} onChange={(v) => setP((x) => ({ ...x, taken_before: v }))} cols={3} />
        </Question>
      </Card>
      {error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">Could not save your answers: {error}. Please check your connection and try again.</p>}
      <BottomBar>
        <PrimaryButton
          disabled={!complete || submitting}
          onClick={() => onDone({ ...(p as PostGame), recall: recall as PostGame['recall'] })}
        >
          {submitting ? 'Saving…' : error ? 'Try again' : 'Submit my answers'}
        </PrimaryButton>
      </BottomBar>
    </>
  )
}

/* ---------------------------------------------------------------- Done */

export function DoneScreen({ participantId }: { participantId: string }) {
  return (
    <div className="pt-10 text-center">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-700">✓</div>
      <H1>Thank you!</H1>
      <p className="mb-6 text-slate-600">Your anonymous answers have been recorded. You can close this page now.</p>
      {IS_TEST && <p className="text-xs text-slate-400">Test record ID: {participantId}</p>}
    </div>
  )
}
