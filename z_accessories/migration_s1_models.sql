-- z_accessories S1 (2026-10-25): 3D models for accessories + the chrome Finista range.
-- 1. Model columns (same names as fixtures / handles): model_url, model_format, model_scale.
--    Files in storage bucket `accessory-models` (public read, admin write).
--    Anchors (from the files' own notes): rail = left end, profile centre, +X along;
--    end support = panel face on the rail centreline, cup opens +X (right end turned
--    180° about Y); pillars = shelf underside at the pillar centre, rail centre
--    `height_mm` (50) below, end pillar's closed end faces -X.
-- 2. Mark 2026-10-25: chrome, not white — rows switched to the chrome codes the
--    models carry (7104016 rail, 7104018 end support, 7104019 centre pillar,
--    7104020 end pillar). Sizes nominal (no published spec): end support 42 round,
--    16 off the panel; pillars 40 base, rail centre 50 below the shelf.

alter table hardware_accessories add column if not exists model_url text;
alter table hardware_accessories add column if not exists model_format text;
alter table hardware_accessories add column if not exists model_scale numeric not null default 1;

insert into storage.buckets (id, name, public) values ('accessory-models', 'accessory-models', true)
on conflict (id) do nothing;

drop policy if exists accessory_models_public_read on storage.objects;
create policy accessory_models_public_read on storage.objects for select using (bucket_id = 'accessory-models');

drop policy if exists models_admin_insert on storage.objects;
create policy models_admin_insert on storage.objects for insert
  with check (bucket_id = any (array['hinge-models', 'slide-models', 'fixture-models', 'accessory-models']) and (select public.is_admin()));
drop policy if exists models_admin_update on storage.objects;
create policy models_admin_update on storage.objects for update
  using (bucket_id = any (array['hinge-models', 'slide-models', 'fixture-models', 'accessory-models']) and (select public.is_admin()));
drop policy if exists models_admin_delete on storage.objects;
create policy models_admin_delete on storage.objects for delete
  using (bucket_id = any (array['hinge-models', 'slide-models', 'fixture-models', 'accessory-models']) and (select public.is_admin()));

update hardware_accessories set name = 'Finista oval hanging rail 15 x 30 Chrome 3.6m', supplier_code = '7104016',
       colour = '#cfd0d4', finish = 'Chrome', cost_per_unit = null,
       notes = 'Chrome (Mark 2026-10-25). Price not checked. Rail stops 5 short of each panel: cut length = clear opening - 10.'
 where supplier_code = '7104006';
update hardware_accessories set name = 'Finista oval end support, screw-on, chrome', supplier_code = '7104018',
       height_mm = 42, width_mm = 42, depth_mm = 16, colour = '#cfd0d4', finish = 'Chrome',
       notes = 'Nominal 42 round flange, 16 projection, centred on the rail. Was 1-490-112 (white).'
 where supplier_code = '1-490-112';
update hardware_accessories set name = 'Finista oval centre pillar, chrome', supplier_code = '7104019',
       height_mm = 50, width_mm = 40, depth_mm = 40, colour = '#cfd0d4', finish = 'Chrome',
       notes = 'Nominal 40 base; rail centre 50 below the shelf (height_mm). Was 1-490-116 (white).'
 where supplier_code = '1-490-116';
update hardware_accessories set name = 'Finista oval end pillar, chrome', supplier_code = '7104020',
       height_mm = 50, width_mm = 40, depth_mm = 40, colour = '#cfd0d4', finish = 'Chrome',
       notes = 'Nominal 40 base; rail centre 50 below the shelf (height_mm); closed end. Was 1-490-118 (white).'
 where supplier_code = '1-490-118';

-- S1b (2026-10-25): Mark's corrected end support GLB (from the manufacturer FBX).
-- Plate 18.6 W x 42.8 H x 3 T, 13 projection, NOT centred on the rail: bottom 16.7
-- below the rail centre. 3 x Ø4 holes centred on the plate at 5.4 / 14.9 / 37.4 up
-- from its bottom — the joint pricks the outer two (32 apart). Rail end 3 off the panel.
alter table hardware_accessories add column if not exists below_rail_mm numeric;
alter table hardware_accessories add column if not exists rail_gap_mm numeric;
update hardware_accessories set height_mm = 42.8, width_mm = 18.6, depth_mm = 13, below_rail_mm = 16.7, rail_gap_mm = 3
 where supplier_code = '7104018';
update hardware_accessories set rail_gap_mm = 5 where supplier_code = '7104020';
update joint_type_operations set offset_z_mm = 5.4
 where joint_type_id = (select id from joint_types where name = 'Finista end support');
