-- Invisible Fares v1.2 migration: block randomization, estimate check flag, progress (drop-out) log.
-- Run once in Supabase → SQL Editor after schema.sql. Safe to re-run.

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
