-- z_CAD_tool G1 — protect Mark's CAD from automation (Mark, 2026-11-04).
-- Spec: z_CAD_tool/ANNOTATION-SPEC.md "Automation vs user CAD (G1)". To apply live as `cad_g1_origin_guard`.
--
-- origin          'auto' = inserted by the automation login (automation@rhk.local), 'user' = anyone else.
--                 Set by trigger from who inserts it; callers can't choose it.
-- user_edited_at  set when a non-automation user edits a row (any edit in the app).
--
-- Rule: automation may DELETE only rows with origin = 'auto' and user_edited_at is null.
-- User CAD, and automation CAD the user has touched, can only be edited by automation.
-- The guard also fires on cascades, so automation deleting a wall / cabinet / room that
-- carries protected CAD fails instead of silently taking the CAD with it.
-- Escape hatch for when Mark explicitly asks for a protected item to go:
--   select force_delete_annotations(array['<id>']::uuid[]);
--
-- Existing rows can't be told apart (no creator was recorded), so they're all backfilled
-- as 'user' = protected.

alter table room_annotations
  add column if not exists origin text not null default 'user' check (origin in ('auto', 'user')),
  add column if not exists user_edited_at timestamptz;

comment on column room_annotations.origin is 'auto = drawn by automation@rhk.local, user = drawn by a person. Trigger-set. Automation may only delete auto rows the user never edited.';
comment on column room_annotations.user_edited_at is 'Last edit by a non-automation user. Non-null = protected from automation deletes.';

create or replace function rhk_is_automation() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'automation@rhk.local'
$$;

create or replace function room_annotations_origin_trg() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.origin := case when rhk_is_automation() then 'auto' else 'user' end;
    if rhk_is_automation() then new.user_edited_at := null; end if;
  else -- UPDATE
    new.origin := old.origin;
    if rhk_is_automation() then
      new.user_edited_at := old.user_edited_at;
    else
      new.user_edited_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists room_annotations_origin on room_annotations;
create trigger room_annotations_origin
  before insert or update on room_annotations
  for each row execute function room_annotations_origin_trg();

create or replace function room_annotations_delete_guard_trg() returns trigger
language plpgsql as $$
begin
  if rhk_is_automation()
     and coalesce(current_setting('rhk.cad_force_delete', true), '') <> 'on'
     and (old.origin = 'user' or old.user_edited_at is not null) then
    raise exception 'Protected CAD %: % "%" was drawn or edited by the user - edit it instead of deleting (or delete the wall/cabinet without it)',
      old.id, old.kind, left(coalesce(old.text, ''), 40)
      using errcode = 'P0001';
  end if;
  return old;
end $$;

drop trigger if exists room_annotations_delete_guard on room_annotations;
create trigger room_annotations_delete_guard
  before delete on room_annotations
  for each row execute function room_annotations_delete_guard_trg();

-- Only for when Mark explicitly asks for specific protected items to be deleted.
create or replace function force_delete_annotations(ids uuid[]) returns int
language plpgsql security invoker as $$
declare n int;
begin
  perform set_config('rhk.cad_force_delete', 'on', true);
  delete from room_annotations where id = any(ids);
  get diagnostics n = row_count;
  perform set_config('rhk.cad_force_delete', '', true);
  return n;
end $$;
