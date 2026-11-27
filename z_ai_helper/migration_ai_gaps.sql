-- AI helper Q7 (z_ai_helper/AI-HELPER-SPEC.md, Mark 2026-11-27): every time the chat
-- can't do something it was asked, it logs it (report_gap tool) so Settings › AI helper
-- can show a "Can't do yet" build list. Same job access as the rest of the AI tables.

create table if not exists public.ai_gaps (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  room_id         uuid references public.rooms(id) on delete set null,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  user_id         uuid default auth.uid() references auth.users(id),
  -- What the user asked for, in their words (short), and what's missing, as a feature name
  -- the AI keeps the same across reports so they group (e.g. "drawers inside a bay").
  request         text not null,
  missing         text not null,
  status          text not null default 'open' check (status in ('open', 'built', 'ignored')),
  created_at      timestamptz not null default now()
);
create index if not exists ai_gaps_status_idx on public.ai_gaps (status, created_at desc);

alter table public.ai_gaps enable row level security;
drop policy if exists job_access on public.ai_gaps;
create policy job_access on public.ai_gaps for all to authenticated
  using ((select public.is_admin()) or public.can_access_project(project_id))
  with check ((select public.is_admin()) or public.can_access_project(project_id));
