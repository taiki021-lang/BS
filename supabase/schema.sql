-- Invisible Fares: anonymous response storage.
-- Run once in Supabase → SQL Editor. Safe to re-run.
--
-- Security model:
--   * Respondents use the public "anon" key. They may INSERT one row and nothing else:
--     no SELECT, UPDATE or DELETE, so nobody can read other participants' data.
--   * The researcher reads data only via the service-role key, which lives solely in the
--     Vercel server function (/api/export) or the Supabase dashboard.

create table if not exists public.responses (
  participant_id              uuid primary key,
  created_at                  timestamptz not null default now(),
  design_version              text        not null,
  seed                        bigint      not null check (seed between 0 and 4294967295),
  condition                   text        not null check (condition in ('A', 'B')),
  is_test                     boolean     not null,
  is_simulated                boolean     not null default false,
  ethics_ref                  text,
  started_at                  timestamptz not null,
  completed_at                timestamptz not null,
  profile                     jsonb       not null,
  design_usual_departure_min  integer     not null check (design_usual_departure_min between 0 and 1439),
  fare_rule                   jsonb       not null,
  tasks                       jsonb       not null check (jsonb_typeof(tasks) = 'array' and jsonb_array_length(tasks) = 10),
  choices                     jsonb       not null check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) = 10),
  rule_check_attempts         integer     not null check (rule_check_attempts >= 0),
  estimate_confidence         integer     not null check (estimate_confidence between 1 and 5),
  estimated_total_cents       integer     not null check (estimated_total_cents between 0 and 100000),
  actual_total_cents          integer     not null check (actual_total_cents between 0 and 100000),
  allowance_cents             integer     not null,
  remaining_cents             integer     not null,
  post                        jsonb       not null,
  timings                     jsonb       not null default '{}'::jsonb,
  -- Basic abuse guard: a real record is ~15 KB.
  constraint responses_size check (pg_column_size(tasks) + pg_column_size(choices) + pg_column_size(profile) + pg_column_size(post) < 200000),
  constraint responses_remaining check (remaining_cents = allowance_cents - actual_total_cents)
);

create index if not exists responses_created_at_idx on public.responses (created_at);

alter table public.responses enable row level security;

-- Start from zero privileges for client roles.
revoke all on public.responses from anon, authenticated;

-- anon may insert every column except created_at (always set by the server).
grant insert (
  participant_id, design_version, seed, condition, is_test, is_simulated, ethics_ref,
  started_at, completed_at, profile, design_usual_departure_min, fare_rule, tasks, choices,
  rule_check_attempts, estimate_confidence, estimated_total_cents, actual_total_cents,
  allowance_cents, remaining_cents, post, timings
) on public.responses to anon;

drop policy if exists "anon can insert responses" on public.responses;
create policy "anon can insert responses"
  on public.responses
  for insert
  to anon
  with check (true);

-- No SELECT/UPDATE/DELETE policies exist for anon/authenticated, so those operations are denied.

-- Convenience view for the researcher in the dashboard (service role / SQL editor only).
create or replace view public.responses_summary
with (security_invoker = true) as
select participant_id, created_at, condition, is_test, is_simulated, design_version,
       estimated_total_cents, actual_total_cents,
       estimated_total_cents - actual_total_cents as estimate_error_cents
from public.responses;
revoke all on public.responses_summary from anon, authenticated;

-- ---------------------------------------------------------------- v1.2 additions

-- 1. New response columns (insertable by anon, like the others).
alter table public.responses add column if not exists assignment_method text check (assignment_method in ('block', 'seed'));
alter table public.responses add column if not exists assignment_slot bigint check (assignment_slot >= 1);
alter table public.responses add column if not exists estimate_warning_shown boolean;
grant insert (assignment_method, assignment_slot, estimate_warning_shown) on public.responses to anon;

-- 2. Permuted-block randomization: server-side slot counters (separate for test and live).
create sequence if not exists public.assignment_seq_live;
create sequence if not exists public.assignment_seq_test;
revoke all on sequence public.assignment_seq_live, public.assignment_seq_test from anon, authenticated;

create or replace function public.claim_assignment_slot(p_is_test boolean)
returns bigint
language sql
security definer
set search_path = public
as $$
  select case when p_is_test then nextval('public.assignment_seq_test') else nextval('public.assignment_seq_live') end
$$;
revoke all on function public.claim_assignment_slot(boolean) from public;
grant execute on function public.claim_assignment_slot(boolean) to anon;

-- 3. Anonymous progress log (insert-only) to compare drop-out between conditions.
create table if not exists public.progress (
  id                bigserial   primary key,
  created_at        timestamptz not null default now(),
  participant_id    uuid        not null,
  design_version    text        not null,
  condition         text        not null check (condition in ('A', 'B')),
  assignment_method text        not null check (assignment_method in ('block', 'seed')),
  is_test           boolean     not null,
  step              text        not null check (step in ('profile', 'scenario', 'rule', 'task', 'task_done', 'estimate', 'reveal', 'post', 'done')),
  task_index        integer     check (task_index between 0 and 9)
);
create index if not exists progress_participant_idx on public.progress (participant_id);

alter table public.progress enable row level security;
revoke all on public.progress from anon, authenticated;
grant insert (participant_id, design_version, condition, assignment_method, is_test, step, task_index) on public.progress to anon;
grant usage on sequence public.progress_id_seq to anon;

drop policy if exists "anon can insert progress" on public.progress;
create policy "anon can insert progress" on public.progress for insert to anon with check (true);
