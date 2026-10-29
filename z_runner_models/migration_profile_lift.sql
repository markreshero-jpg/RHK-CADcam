-- Dragon Pro box height above the runner (2026-10-29).
-- Nikpol guide p.6: front holes from the runner bottom (cabinet floor) 47.5;
-- drawer-bottom underside 22.8 up; Mark measured the bottom 8 above the
-- profile's bottom edge → the profile starts 14.8 above the runner bottom
-- (profile top 192.8 = the guide's "min 192" for the 178). Holes unchanged —
-- only where the box / profile sit.

alter table hardware_slides
  add column if not exists profile_lift numeric not null default 0;
comment on column hardware_slides.profile_lift is
  'System drawers: mm the drawer box (and its steel profile) sits above the runner bottom. Dragon Pro 14.8.';

update hardware_slides set profile_lift = 14.8 where drawn_as = 'dragon_pro';

-- Bottom + back 8 above the profile bottom (was the default 12).
update drawer_box_methods
   set rules = rules || '{"DB_DADO_HEIGHT": 8, "DB_BACK_Y_OFFSET": 8}'::jsonb
 where name = 'DTC Dragon Pro';

-- The 500s drop their GLB so every length uses the parametric drawing (which
-- lifts the profile; the single-mesh GLB can't). Files stay in storage:
--   slide-models/bacd2f97-…/1780106996793-DTC_DragonPro_95x500.glb  (anchor_y -93)
--   slide-models/e049e805-…/1780108390267-DTC_DragonPro_127x500.glb (anchor_y -127)
--   slide-models/23507573-…/1780207087107-DTC_DragonPro_178x500.glb (anchor_y -176)
update hardware_slides
   set model_url = null, model_format = null, model_scale = 1,
       model_anchor_x = 0, model_anchor_y = 0, model_anchor_z = 0
 where drawn_as = 'dragon_pro' and model_url is not null;
