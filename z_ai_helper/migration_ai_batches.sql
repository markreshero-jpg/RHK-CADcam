-- AI helper AI0 (z_ai_helper/AI-HELPER-SPEC.md): one row per applied batch of
-- AI changes — what each cabinet was before and after — so one Undo reverts the
-- batch and the job keeps a history of what the AI changed.
--
-- entries: [{ cabinet_id, label, before: {field: value}, after: {field: value} }]
-- Same job access as the job's other tables (z_access_control).

create table if not exists public.ai_batches (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  room_id     uuid references public.rooms(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id),
  description text not null,
  source      text not null default 'ai',        -- 'ai' | 'script' | 'undo'
  entries     jsonb not null default '[]'::jsonb,
  warnings    jsonb not null default '[]'::jsonb,
  undone_at   timestamptz,
  undone_by   uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index if not exists ai_batches_project_idx on public.ai_batches (project_id, created_at desc);

alter table public.ai_batches enable row level security;

drop policy if exists job_access on public.ai_batches;
create policy job_access on public.ai_batches for all to authenticated
  using ((select public.is_admin()) or public.can_access_project(project_id))
  with check ((select public.is_admin()) or public.can_access_project(project_id));
