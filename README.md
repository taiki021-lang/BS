# Invisible Fares: The Commuting Game

A mobile-first web survey game for the *Invisible Fares* study (11.478). Respondents plan ten commuting
days under a fixed allowance. They are randomly assigned to **Condition A** (fare shown for every option) or
**Condition B** (same fare rule explained up front, fares hidden during the game, bill shown at the end).

Stack: React + Vite + TypeScript, Tailwind CSS, Supabase (anonymous insert-only storage), Vercel (static site + one
serverless export function). There are no user accounts.

> **The app stays in TEST MODE** until you set `VITE_STUDY_MODE=live`. In test mode a yellow banner is shown and every
> record is stored with `is_test = true`. COUHES review is not required for this course project (confirmed with the
> instructor), so no ethics reference is needed to go live.

---

## 1. Run locally (no Supabase needed)

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # automated tests (fares, randomization, data integrity, CSV)
npm run build        # type-check + production build
```

Without Supabase variables the app runs as a **local prototype**: submissions are saved in the browser's
`localStorage`.

* Researcher page: `http://localhost:5173/#/admin`. Download `participants.csv` / `choices_long.csv` and
  generate **simulated test submissions** (flagged `is_simulated = true`, test mode only) to check the pipeline.
* QA: in test mode, `?seed=12345` reproduces a specific participant's randomization (condition and tasks).

## 2. Participant flow

1. Welcome, study information, consent (18+ and agree)
2. Commuting experience, anchored on the **most recent full-time job** (or the current one): work experience
   (current / previous / never full-time), when they last worked full-time (previous only), then office days, day
   choice, mode, typical one-way door-to-door commute time (bands; recorded only, not used in the game), who paid for commuting, how they paid for transit (pass / pay per trip / employer pass …), whether they knew the single-trip fare, total monthly commuting cost, whether morning responsibilities fixed their departure, start-time flexibility, usual departure time; then “About you”: current role (MIT staff, Sloan Fellow, MBA, …), broad job region, age band (all with “Prefer not to say”). Wording switches to
   past tense for a previous job. Respondents who never worked full-time answer for their current main routine.
3. 2035 scenario and allowance, then the participant's own randomized **fare rule** table and a one-question
   comprehension check (identical in both conditions)
4. Condition A/B (derived from the seed when the session starts; first shown at step 3)
5. Ten choice tasks, each with three options: Peak (usual time), Earlier off-peak, Later off-peak
6. Estimate of total fares, plus confidence, **before** the bill is shown
7. Bill: total fares, allowance, amount kept (totals only, no per-day breakdown)
8. Post-game: recall of each weekday's discount, allowance tracking, fare influence, AI trust and delegation,
   fairness of peak pricing and of day-varying fares
9. Completion

Progress is saved in `sessionStorage`. A page refresh resumes the same participant, so refreshing cannot be used to
get a new condition.

## 3. Experiment design and assumptions

All design code is in [`src/lib/design.ts`](src/lib/design.ts) and constants in [`src/lib/config.ts`](src/lib/config.ts).
Design version: `invisible-fares-v1.7` (v1.7: peak fare $15.00, allowance $150, suburban setting; v1.6: intro video; v1.5: “Another day” option removed → three options; clearer instructions; income question removed. v1.4: paired A/B task designs within each block; v1.1: profile questions; v1.2: block randomization, game departure time clamped to 6:30–9:30, wording fixes, progress log; v1.3: consent AI/withdrawal statements, fare-awareness and persona items, manipulation check, decision factors. The task design is unchanged since v1.2.), stored with every record.

| Element | Implementation |
|---|---|
| Peak fare | $15.00 every day (regional train from a suburb into the city) |
| Off-peak discounts | 0, 15, 30, 45 %, so off-peak fares are $15.00 / $12.75 / $10.50 / $8.25 (integer cents) |
| Fare rule | Random mapping of discounts to Mon–Fri: all four levels plus one randomly repeated level (5 days, 4 levels) |
| Tasks | 10. Each weekday appears exactly twice, in random order. All four discount levels always appear. |
| Crowding | Peak option: standing/packed. Off-peak options: seated/standing. |
| Time shift | 30 or 60 min, for both the earlier and the later option |
| Attribute balance | 2×2×2 full factorial (8) plus one random profile and its fold-over complement, so each level appears exactly 5 times |
| Option order | Fixed (Peak, Earlier, Later) and identical in A and B |
| Condition | **Permuted blocks of 4** (2 A + 2 B per block, random order). When the participant consents, the app claims the next slot from a server sequence (`claim_assignment_slot`; separate counters for test and live) and `blockCondition(slot)` gives the condition. If the server cannot be reached, it falls back to simple 1:1 randomization from the seed. Stored as `assignment_method` (`block`/`seed`) + `assignment_slot`. **Paired designs (v1.4):** in each block the k-th A slot and the k-th B slot share one design seed (`pairSeed(slot)`), so the two conditions receive exactly the same task sets; `pair_id` in `participants.csv` identifies the pair. |
| Randomization | Seeded `mulberry32` PRNG. A cryptographically random 32-bit seed is drawn per participant, and the seed plus design version regenerate the exact tasks. |

**A and B differ only in:** (a) the fare amount on each option card, (b) half a sentence on the scenario page
("the fare for each option is shown on screen when you choose" vs. "fares are not shown when you choose"; both then
read "At the end you will see your total bill."), and (c) one extra footer sentence on the task screen for A ("The fare
for each option is shown above."; both read "Fares are billed at the end using the fare rule."). Day of week, times, trade-offs, crowding, the fare-rule table and the comprehension check are identical.
Neither condition sees the remaining allowance or a running total during the game, and neither can return to the
fare-rule table.

**Rules reminder (identical in A and B):** the fare-rule screen ends with a “Before you start” card, and every day
shows one reminder line: each day is separate; office days are fixed and only the departure time is chosen; there are no
right answers. It deliberately **never repeats the fare rule, discounts, the allowance or any running total**, because
those are what the experiment tests (fare salience in B, rule recall, estimate error). Always visible rather than
behind a button, so every participant sees the same text the same number of times.

**Neutral presentation (no nudging):** all four options share the same card style. Cheap options are not highlighted
and nothing is labelled as a saving. Fares in A are plain text in the same color for every option.

### Assumptions to confirm (from the proposal → implementation)

1. **No “Another day” (work-from-home) option (deviation from the proposal).** The proposal had a fourth option, working
   from home and going in on another weekday. Pilot testers found it confusing (which week? does it break the three-day
   week?), and its fare came from a different day than the task day, which blurs the discount effect. Since v1.5 each
   task has three options, so the game measures **time-of-day** shifting only. Willingness to move an office day is
   asked once as a hypothetical post-game question (`day_switch`: would you move to a day with a 45% off-peak
   discount?) and discussed with SWAA data; it is a stated attitude, not observed game behaviour. Report this as a scope change.
2. **Ten-task schedule.** The ten tasks are ten independent office days from different weeks, shown in no
   particular order (the scenario says so). Each weekday appears exactly twice, in random order. With one repeated discount level, the task days
   carry that level 4 times and the other three levels 2 times each. Across respondents the repeated level is
   uniform.
3. **Peak window and departure range.** The proposal's fixed 7:30–9:00 window cannot hold for 30-minute shifts when someone's usual
   time is mid-peak (8:15 − 30 min = 7:45 would still be peak). The game therefore treats **leaving at your usual
   time as peak** and the shifted times as off-peak. The fare rule text says this ("leaving at your usual, busy time").
   Respondents with no regular time use 8:15 a.m. (flagged by `profile_usual_departure_min` = empty).
   Since v1.2 the time used in the game is **clamped to 6:30–9:30 a.m.**, so "your usual time" is a plausible busy
   period and shifted times stay realistic (no 4 a.m. or noon departures). The reported time is kept in `profile`;
   the game time is `design_usual_departure_min`. The scenario page says when a time was adjusted.
4. **Fare level and allowance (v1.7).** Respondents live in a suburb and take a regional train into the city (with
   hybrid work, fewer people need to live close in). Peak fare **$15.00**, so a 45% discount saves $6.75 per trip;
   at $5.00 (v1.0–v1.6) the largest saving was $2.25, likely too small for this sample to react to (floor effect for
   H1). **Allowance = $150 for the ten office days** (ten peak trips): an all-peak plan uses exactly the allowance and
   any shift leaves money over.
5. **Shift costs.** Earlier: "Wake up 30 minutes / 1 hour earlier". Later: "Arrive 30 minutes late for your morning
   team meeting" / "Miss your morning team meeting".
6. **Recall question comes after the bill reveal** (as in the requested flow). The reveal shows only totals, not
   per-day fares, to limit contamination of fare-rule recall.
7. **Comprehension check** (off-peak fare on the highest-discount day) must be answered correctly to continue, in
   both conditions. The number of attempts is stored.
8. **Past job vs. 2035 game.** The profile asks about the most recent full-time job (recall bias possible;
   `profile_last_fulltime` records how long ago). Only the usual departure time is carried into the game. Everyone
   plays under the same 2035 hybrid schedule (three office days a week, free choice of days), and the scenario
   page tells them to use it even if their past job was different.
9. **Pilot target.** The proposal's 30–60 % off-peak share check needs real pilot data. The simulated records
   choose uniformly at random and must not be used for this.

### Balance between conditions

**Paired design (v1.4, block method).** Within each block of four slots, the first A and the first B slot share one
design seed, and so do the second A and second B. The pair sees the identical fare rule, day order, crowding and shifts; only clock times follow each person's usual departure time. Over complete blocks the A and B task
sets are therefore *identical*, so differences between conditions cannot come from the design
(`analysis/balance.sim.ts`: A–B gap 0 on every attribute). Different pairs still get different random designs.
If one member of a pair drops out, a small chance imbalance remains; `pair_id` lets you check or use pair fixed
effects. Records assigned by the seed fallback (`assignment_method = 'seed'`) are unpaired; for those, the
following still holds:

* **Exactly balanced within every design**: each weekday twice, peak crowding 5/5, off-peak crowding 5/5, shift 5/5,
  all four discount levels present. These shares are therefore identical in A and B.
* **Balanced in expectation (chance differences only)**: which discount is repeated (4 vs 2/2/2) and the order of days. `analysis/balance.sim.ts` (2,000 simulated studies, 60 + 60) gives typical (95th-percentile)
  A–B gaps of 1.2 points in mean task discount and 15 points in the share starting on a
  given weekday.
* **Everything is recorded per task** (`choices_long.csv`: day, day discount, shift, both crowding levels, every
  option's fare), so the analysis conditions on the attributes actually shown, and order can be controlled
  with `task_index`. The admin page exports `balance.csv` (A vs B means of these attributes) as a randomization check.

### What the measures capture

* **Behaviour in the game** (choices, estimate error, recall, manipulation check, decision factors) is about the game
  the participant just played.
* **Attitudes** (AI trust, willingness to delegate, fairness) are hypothetical views asked in a separate “Your
  opinions” section, *before* the participant has seen any AI advice. They are not behavioural measures and should
  not be combined with observed price response; use them as covariates or descriptive outcomes only.

### Power check (H1)

`npm run power` runs [`analysis/power.sim.ts`](analysis/power.sim.ts): it builds tasks with the real generator,
simulates respondents (mixed-logit data-generating process with individual heterogeneity), fits a conditional logit
with respondent-clustered SEs and counts how often the Condition × Fare interaction is significant (α = 0.05,
500 replications). **All parameters are planning assumptions, not data**; replace them with pilot estimates. Results
are saved in `analysis/power-results*.json`. At $15 fares (three options) with a fare coefficient of −0.33 per $ in A (off-peak share ≈ 48 %) and 60
respondents per condition: power ≈ 0.33 / 0.70 / 0.86 if fare sensitivity in B is 25 / 40 / 50 % lower (80 per
condition: 0.42 / 0.82 / 0.96). With half that sensitivity (−0.17 per $), power at 60 per condition is 0.16 / 0.34 /
0.47. What matters is the utility of the saving, so tripling the fare has the same effect as tripling per-dollar
sensitivity. The false-positive rate with no true effect is ≈ 5 %.

## 4. Data stored (one row per participant, table `responses`)

`participant_id` (random UUID), `condition`, `assignment_method`, `assignment_slot`, `seed`, `design_version`, `is_test`, `is_simulated`, `ethics_ref`,
`started_at`, `completed_at`, `profile` (JSON), `design_usual_departure_min`, `fare_rule`, `tasks` (all 10 choice sets
with **every alternative's actual fare, including fares hidden in B**), `choices` (chosen alternative and fare,
`shown_at`, `answered_at`, `duration_ms`, `selection_changes`), `rule_check_attempts`, `estimated_total_cents`,
`estimate_confidence`, `estimate_warning_shown` (an estimate above $100 triggers a neutral "is that what you meant?" confirmation), `actual_total_cents`, `allowance_cents`, `remaining_cents`, `post` (JSON: recall, manipulation check `fares_shown_check`, `decision_factors` (up to two), allowance tracking, fare influence, AI trust and delegation, fairness, hypothetical day switching `day_switch`, `taken_before`), `timings`
(ms per screen), and `created_at` (set by the server).

No names, emails, IP addresses or free-text fields are collected.

**Progress log (table `progress`)** — one anonymous row per forward step after consent (`profile`, `scenario`,
`rule`, `task`, `task_done` + `task_index`, `estimate`, `reveal`, `post`, `done`) with `participant_id`, `condition`,
`assignment_method`, `is_test`. Use it to compare drop-out between A and B (the admin page shows started / reached
game / submitted by condition and exports `progress.csv`). The consent text says this.

**Repeat participation:** a device that completed the study is blocked in live mode (test mode shows a notice), and
the post-game survey asks `taken_before`. Neither is foolproof (private windows, other devices), so filter on both.

**Integrity:** before saving and again at export, [`validateSubmission`](src/lib/validate.ts) regenerates the design
from the seed and checks every fare, the chosen fares, the totals and the condition. The export adds `integrity_ok`
and `integrity_errors` columns.

### CSV exports

* `participants.csv`: one row per participant, with flattened profile, rule, recall score, estimate error,
  `manipulation_ok` (A answered “Yes” / B answered “No” to “were fares shown?”), `factor_*` 0/1 columns and timings.
* `choices_long.csv`: one row per **alternative × task × participant** (30 rows per person), with a `chosen`
  0/1 column and `fare_shown`. Ready for mixed logit.

Filter `is_test = false AND is_simulated = false` for analysis.

## 5. Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. **SQL Editor → New query**, paste [`supabase/schema.sql`](supabase/schema.sql), and run it. (Existing v1.0/v1.1
   projects: run [`supabase/migration-v1.2.sql`](supabase/migration-v1.2.sql) instead; it only adds columns, the
   `progress` table and the assignment sequences.)
   * Creates `public.responses` with check constraints (10 tasks, 10 choices, condition A/B, consistent remaining
     allowance).
   * Enables Row Level Security. The public `anon` role may only **INSERT**. It has no select, update or delete
     rights, so respondents can never read anyone's data. `created_at` is set by the server.
3. **Project Settings → API**: copy the *Project URL*, the *anon public* key and the *service_role* key.
4. Local test against Supabase: create `.env.local` (git-ignored) from `.env.example`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...   # anon key only
   ```
   Then run `npm run dev`. The banner should say `storage: supabase`. Complete one run, and check
   **Table Editor → responses**.

The **service_role key must never be placed in a `VITE_` variable.** Anything prefixed `VITE_` is shipped to
browsers.

## 6. Deploy to Vercel

1. Push this folder to a GitHub repository (private is fine) and import it at
   [vercel.com/new](https://vercel.com/new). Framework preset: **Vite** (build `npm run build`, output `dist`).
   Or use the CLI: `npm i -g vercel && vercel`.
2. **Settings → Environment Variables** (Production and Preview):

   | Name | Value | Exposed to browser? |
   |---|---|---|
   | `VITE_SUPABASE_URL` | Project URL | yes (public) |
   | `VITE_SUPABASE_ANON_KEY` | anon key | yes (public, insert-only) |
   | `VITE_STUDY_MODE` | `test` (until approval) | yes |
   | `VITE_ETHICS_APPROVAL_REF` | optional, not required | yes |
   | `VITE_STUDY_CONTACT` | e.g. "Taiki Tazoe, MIT DUSP: <email>" | yes |
   | `SUPABASE_URL` | Project URL | **no** (server only) |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **no** (server only) |
   | `EXPORT_TOKEN` | long random string (≥ 16 chars, e.g. `openssl rand -hex 24`) | **no** (server only) |

3. Redeploy after changing variables. `VITE_*` values are baked in at build time.
4. Open `https://<your-app>.vercel.app/#/admin`, enter the `EXPORT_TOKEN`, then **Load responses** and download
   the CSVs. The token is sent as an `Authorization` header to [`api/export.ts`](api/export.ts). Only that
   server function holds the service-role key.

Fallback export: Supabase **Table Editor → responses → Export → CSV** (raw JSON columns).

### Going live

Run `powershell -ExecutionPolicy Bypass -File scripts\vercel-setup.ps1 -Live -Contact "<name, email>"` (or set
`VITE_STUDY_MODE=live` and `VITE_STUDY_CONTACT` yourself) and redeploy. COUHES review is not required for this course
project (confirmed with the instructor). The banner disappears, `is_test = false`, a device that already completed
the study is blocked, and the simulation tool and `?seed=` override are disabled. Live slots use their own counter,
so block randomization starts fresh. Filter out pre-launch test rows (`is_test = true`) before analysis.

## 7. Tests

`npm test` runs Vitest suites in [`tests/`](tests):

* **fares**: $5.00 peak; $5.00/4.25/3.50/2.75 off-peak; invalid discounts rejected; every generated alternative
  priced by the rule; time shifts.
* **randomization**: deterministic PRNG; same seed gives the same design and condition; usual time does not alter
  the randomized design; ~1:1 assignment over 20,000 seeds; condition independent of the design; per-design
  balance (all four discounts, each weekday twice, each attribute 5/5); discount-to-weekday mapping uniform across
  participants.
* **integrity / CSV**: simulated records validate; survives jsonb key reordering; detects tampered fares, wrong
  condition, wrong totals, mismatched chosen fare, missing tasks; long CSV has 30 rows and one choice per task;
  CSV escaping and formula-injection guard; no identifier columns.

## 8. Project layout

```
src/lib/config.ts     constants (fares, discounts, allowance, design version)
src/lib/design.ts     fare rule, task design, condition assignment
src/lib/rng.ts        seeded PRNG helpers
src/lib/validate.ts   integrity checks
src/lib/csv.ts        CSV builders (participants, long choices)
src/lib/simulate.ts   flagged simulated submissions (pipeline testing only)
src/lib/storage.ts    Supabase insert / localStorage fallback / export fetch
src/ui/               screens, admin page, UI kit
api/export.ts         Vercel function: token-protected export using the service-role key
supabase/schema.sql   table + RLS
```
