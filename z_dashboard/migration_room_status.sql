-- Drawing status per room (was job-level only). Job status stays for archive.
alter table public.rooms add column if not exists status text not null default 'draft'
  check (status in ('draft','quoted','approved','in_production','completed'));
-- Seed from the job (archived jobs → completed).
update public.rooms r set status = case when p.status = 'archived' then 'completed' else p.status end
  from public.projects p where p.id = r.project_id and p.status <> 'draft';

-- ── Archive + soft delete (2026-11-11) ──────────────────────────────────────
alter table public.rooms drop constraint if exists rooms_status_check;
alter table public.rooms add constraint rooms_status_check
  check (status in ('draft','quoted','approved','in_production','completed','archived'));
alter table public.rooms add column if not exists deleted_at timestamptz;
create index if not exists rooms_deleted_at_idx on public.rooms (project_id) where deleted_at is not null;

-- Soft-deleted rooms are invisible to every app query (SELECT policy).
drop policy if exists job_access on public.rooms;
create policy job_access_select on public.rooms for select to authenticated
  using (((select is_admin()) or can_access_project(project_id)) and deleted_at is null);
create policy job_access_insert on public.rooms for insert to authenticated
  with check ((select is_admin()) or can_access_project(project_id));
create policy job_access_update on public.rooms for update to authenticated
  using ((select is_admin()) or can_access_project(project_id))
  with check ((select is_admin()) or can_access_project(project_id));
create policy job_access_delete on public.rooms for delete to authenticated
  using ((select is_admin()) or can_access_project(project_id));

create or replace function public.soft_delete_room(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid;
begin
  select project_id into v_project from rooms where id = p_room_id and deleted_at is null;
  if v_project is null then raise exception 'room not found'; end if;
  if not (is_admin() or can_access_project(v_project)) then raise exception 'not allowed'; end if;
  if (select count(*) from rooms where project_id = v_project and deleted_at is null) <= 1 then
    raise exception 'a job must keep at least one room';
  end if;
  update rooms set deleted_at = now() where id = p_room_id;
end $$;

create or replace function public.restore_room(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid;
begin
  select project_id into v_project from rooms where id = p_room_id;
  if v_project is null then raise exception 'room not found'; end if;
  if not (is_admin() or can_access_project(v_project)) then raise exception 'not allowed'; end if;
  update rooms set deleted_at = null where id = p_room_id;
end $$;

create or replace function public.deleted_rooms(p_project_id uuid)
returns table (id uuid, name text, deleted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.deleted_at from rooms r
  where r.project_id = p_project_id and r.deleted_at is not null
    and (is_admin() or can_access_project(p_project_id))
  order by r.deleted_at desc
$$;

revoke execute on function public.soft_delete_room(uuid), public.restore_room(uuid), public.deleted_rooms(uuid) from anon, public;
grant execute on function public.soft_delete_room(uuid), public.restore_room(uuid), public.deleted_rooms(uuid) to authenticated;

-- ── Mark's status list (2026-11-11) ─────────────────────────────────────────
alter table public.rooms drop constraint if exists rooms_status_check;
update public.rooms set status = case status
  when 'quoted' then 'draft_sent' when 'in_production' then 'sent_to_machine'
  when 'completed' then 'sent_to_machine' else status end;
alter table public.rooms add constraint rooms_status_check
  check (status in ('draft','draft_sent','needs_site_measure','waiting_approval','approved','sent_to_machine','archived'));
