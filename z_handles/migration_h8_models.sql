-- z_handles H8a (D16): uploaded 3D models for bought handles.
-- Same model columns as fixture_catalog, plus rot_z (handles turn about the
-- face normal). Model space: origin = hole midpoint on the handle's back,
-- +X along the handle, +Y up, +Z out of the door.

alter table public.hardware_handles
  add column if not exists model_url    text,
  add column if not exists model_format text,
  add column if not exists model_scale  numeric not null default 1,
  add column if not exists model_rot_x  numeric not null default 0,
  add column if not exists model_rot_y  numeric not null default 0,
  add column if not exists model_rot_z  numeric not null default 0,
  add column if not exists model_off_x  numeric not null default 0,
  add column if not exists model_off_y  numeric not null default 0,
  add column if not exists model_off_z  numeric not null default 0;

alter table public.hardware_handles drop constraint if exists hardware_handles_model_format_check;
alter table public.hardware_handles add constraint hardware_handles_model_format_check
  check (model_format is null or model_format in ('glb', 'stl', 'obj'));

-- Storage: public read, admin write (same as hinge / slide / fixture models).
insert into storage.buckets (id, name, public)
values ('handle-models', 'handle-models', true)
on conflict (id) do nothing;

drop policy if exists handle_models_public_read on storage.objects;
create policy handle_models_public_read on storage.objects
  for select using (bucket_id = 'handle-models');

drop policy if exists models_admin_insert on storage.objects;
create policy models_admin_insert on storage.objects for insert
  with check (bucket_id = any (array['hinge-models', 'slide-models', 'fixture-models', 'handle-models']) and (select public.is_admin()));

drop policy if exists models_admin_update on storage.objects;
create policy models_admin_update on storage.objects for update
  using (bucket_id = any (array['hinge-models', 'slide-models', 'fixture-models', 'handle-models']) and (select public.is_admin()));

drop policy if exists models_admin_delete on storage.objects;
create policy models_admin_delete on storage.objects for delete
  using (bucket_id = any (array['hinge-models', 'slide-models', 'fixture-models', 'handle-models']) and (select public.is_admin()));
