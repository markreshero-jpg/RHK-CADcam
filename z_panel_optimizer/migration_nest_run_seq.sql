-- Optimiser saved runs: run numbers per job (RHK6570-R1, R2 …), 2026-10-30.
-- A counter, never max(existing)+1, so a deleted run's number is never handed
-- out again — its NC files may still be on the server.
alter table public.projects add column if not exists nest_run_seq integer not null default 0;

-- Atomic next number. Security invoker: the caller's projects UPDATE policy applies.
create or replace function public.next_nest_run_no(p_project_id uuid)
returns integer
language sql
security invoker
set search_path = public
as $$
  update projects set nest_run_seq = nest_run_seq + 1 where id = p_project_id returning nest_run_seq;
$$;

grant execute on function public.next_nest_run_no(uuid) to authenticated;
revoke execute on function public.next_nest_run_no(uuid) from public, anon;
