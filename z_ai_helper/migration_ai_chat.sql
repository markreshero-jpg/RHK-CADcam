-- AI helper AI1 (z_ai_helper/AI-HELPER-SPEC.md): the job's chat thread and the
-- cost log. One thread per job (locked decision 3); each message records the
-- scope / room it was sent at. Assistant rows carry the model, tokens and cost
-- of the whole turn (every API call in its tool loop).
-- Same job access as the job's other tables (z_access_control).

create table if not exists public.ai_messages (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  room_id       uuid references public.rooms(id) on delete set null,
  user_id       uuid not null default auth.uid() references auth.users(id),
  role          text not null check (role in ('user', 'assistant')),
  text          text not null,
  scope         text not null default 'room',      -- 'selection' | 'room' | 'job'
  model         text,
  input_tokens  integer not null default 0,         -- uncached input
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  output_tokens integer not null default 0,
  api_calls     integer not null default 0,
  cost_usd      numeric(10, 5) not null default 0,
  ms            integer,
  created_at    timestamptz not null default now()
);

create index if not exists ai_messages_project_idx on public.ai_messages (project_id, created_at);

alter table public.ai_messages enable row level security;

drop policy if exists job_access on public.ai_messages;
create policy job_access on public.ai_messages for all to authenticated
  using ((select public.is_admin()) or public.can_access_project(project_id))
  with check ((select public.is_admin()) or public.can_access_project(project_id));
