-- C2: stone colours as child rows of a stone type (BENCHTOP-COLOURS-SPEC.md C2).
-- A colour is a benchtop_materials row whose parent_id is its stone type
-- ("20mm Stone"), so schedules, per-role overrides, the Benchtop Quote and the
-- resolver keep keying on one benchtop_material_id. Mirrors MC1 (board colours).
-- C4: texture_path = full-slab photo in the benchtop-textures bucket, laid at
-- true size (texture_w_mm × texture_h_mm = the slab the photo shows).

alter table benchtop_materials
  add column if not exists parent_id     uuid references benchtop_materials(id) on delete restrict,
  add column if not exists colour_name   text,
  add column if not exists colour_code   text,
  add column if not exists range_name    text,        -- supplier price group, e.g. "Premium Plus"
  add column if not exists overridden    text[] not null default '{}',
  add column if not exists texture_path  text,        -- benchtop-textures bucket path
  add column if not exists thumb_path    text,
  add column if not exists texture_w_mm  numeric,
  add column if not exists texture_h_mm  numeric,
  add column if not exists source_url    text;

create index if not exists benchtop_materials_parent_id_idx on benchtop_materials(parent_id);
create unique index if not exists benchtop_materials_colour_uniq
  on benchtop_materials(parent_id, brand, colour_name) where parent_id is not null;

-- Colour rows: inherit the stone type's fields, generate "Type – Brand Colour".
-- Colour-owned: brand, colour_name/code, range_name, color, finish, texture_*,
-- cost_per_metre (null = the type's), notes, active. sheet_dx/dy inherit unless
-- listed in overridden (slab sizes differ by supplier).
create or replace function benchtop_colour_inherit() returns trigger
language plpgsql as $$
declare b benchtop_materials%rowtype;
begin
  if new.parent_id is null then return new; end if;
  select * into b from benchtop_materials where id = new.parent_id;
  if b.parent_id is not null then
    raise exception 'benchtop colour parent must be a stone type (parent_id null)';
  end if;
  if coalesce(new.colour_name, '') = '' then
    raise exception 'benchtop colour needs a colour_name';
  end if;
  new.name            := b.name || ' – ' || coalesce(nullif(new.brand, '') || ' ', '') || new.colour_name;
  new.dz              := b.dz;
  new.material_type   := b.material_type;
  new.has_grain       := b.has_grain;
  new.grain_direction := b.grain_direction;
  new.edge_profile    := b.edge_profile;
  new.finish          := coalesce(new.finish, b.finish);
  if not ('sheet_dx' = any(new.overridden)) then new.sheet_dx := b.sheet_dx; end if;
  if not ('sheet_dy' = any(new.overridden)) then new.sheet_dy := b.sheet_dy; end if;
  return new;
end $$;

drop trigger if exists benchtop_colour_inherit on benchtop_materials;
create trigger benchtop_colour_inherit
  before insert or update on benchtop_materials
  for each row execute function benchtop_colour_inherit();

-- Type edits flow down: touching the colours re-runs the inherit trigger.
create or replace function benchtop_type_propagate() returns trigger
language plpgsql as $$
begin
  if new.parent_id is null and (new.name, new.dz, new.material_type, new.sheet_dx, new.sheet_dy, new.has_grain, new.edge_profile)
       is distinct from (old.name, old.dz, old.material_type, old.sheet_dx, old.sheet_dy, old.has_grain, old.edge_profile) then
    update benchtop_materials set updated_at = now() where parent_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists benchtop_type_propagate on benchtop_materials;
create trigger benchtop_type_propagate
  after update on benchtop_materials
  for each row execute function benchtop_type_propagate();

-- Slab photos: public read (3D views load them as textures), admin write.
insert into storage.buckets (id, name, public)
values ('benchtop-textures', 'benchtop-textures', true)
on conflict (id) do nothing;

drop policy if exists benchtop_textures_public_read on storage.objects;
create policy benchtop_textures_public_read on storage.objects
  for select using (bucket_id = 'benchtop-textures');
drop policy if exists benchtop_textures_admin_insert on storage.objects;
create policy benchtop_textures_admin_insert on storage.objects
  for insert with check (bucket_id = 'benchtop-textures' and (select is_admin()));
drop policy if exists benchtop_textures_admin_update on storage.objects;
create policy benchtop_textures_admin_update on storage.objects
  for update using (bucket_id = 'benchtop-textures' and (select is_admin()));
drop policy if exists benchtop_textures_admin_delete on storage.objects;
create policy benchtop_textures_admin_delete on storage.objects
  for delete using (bucket_id = 'benchtop-textures' and (select is_admin()));
