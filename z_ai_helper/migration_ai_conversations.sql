-- AI helper (z_ai_helper/AI-HELPER-SPEC.md, Mark 2026-11-08): several conversations per
-- job instead of one running thread (supersedes locked decision 3). Each message
-- belongs to a conversation; only that conversation's history goes back to the model.
-- Existing messages become one "Earlier chat" per job. Same job access as the rest.

create table if not exists public.ai_conversations (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  title           text not null default 'New chat',
  created_by      uuid not null default auth.uid() references auth.users(id),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index if not exists ai_conversations_project_idx on public.ai_conversations (project_id, last_message_at desc);

alter table public.ai_conversations enable row level security;
drop policy if exists job_access on public.ai_conversations;
create policy job_access on public.ai_conversations for all to authenticated
  using ((select public.is_admin()) or public.can_access_project(project_id))
  with check ((select public.is_admin()) or public.can_access_project(project_id));

alter table public.ai_messages add column if not exists conversation_id uuid references public.ai_conversations(id) on delete cascade;
create index if not exists ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

-- Backfill: one "Earlier chat" per job that has messages.
insert into public.ai_conversations (project_id, title, created_by, created_at, last_message_at)
select m.project_id, 'Earlier chat', (array_agg(m.user_id order by m.created_at))[1], min(m.created_at), max(m.created_at)
from public.ai_messages m
where m.conversation_id is null
  and not exists (select 1 from public.ai_conversations c where c.project_id = m.project_id and c.title = 'Earlier chat')
group by m.project_id;

update public.ai_messages m set conversation_id = c.id
from public.ai_conversations c
where m.conversation_id is null and c.project_id = m.project_id and c.title = 'Earlier chat';
