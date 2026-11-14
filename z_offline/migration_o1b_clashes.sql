-- Offline step 1b (z_offline/OFFLINE-SPEC.md): clash flag.
-- 1. room_annotations.updated_at is stamped by the server on every insert / update, so it
--    can be trusted to tell "someone else changed this since I last saw it" (undo used to
--    write a row back with its old timestamp).
-- 2. annotation_clashes: one row per clash found when a queued change was sent.

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists room_annotations_touch on public.room_annotations;
create trigger room_annotations_touch before insert or update on public.room_annotations
  for each row execute function public.touch_updated_at();

create table if not exists public.annotation_clashes (
  id               uuid primary key default gen_random_uuid(),
  room_id          uuid not null references public.rooms(id) on delete cascade,
  annotation_id    uuid not null,              -- no FK: the item may be gone
  -- changed  = someone else edited it; your change was saved over theirs (theirs kept here)
  -- restored = someone else deleted it; your edit put it back
  -- lost     = someone else deleted it; your edit couldn't be applied (yours kept here)
  kind             text not null check (kind in ('changed', 'restored', 'lost')),
  my_op            text not null check (my_op in ('upsert', 'patch', 'delete')),
  theirs           jsonb,                      -- their version of the row before yours went in
  mine             jsonb,                      -- your row / patch
  their_updated_at timestamptz,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by      uuid
);
create index if not exists annotation_clashes_room_open on public.annotation_clashes (room_id) where resolved_at is null;

alter table public.annotation_clashes enable row level security;
drop policy if exists job_access on public.annotation_clashes;
create policy job_access on public.annotation_clashes for all
  using ((select public.is_admin()) or public.can_access_room(room_id))
  with check ((select public.is_admin()) or public.can_access_room(room_id));
