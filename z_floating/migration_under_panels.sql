-- z_floating F6/F7 (renamed BUP + WUP added in F8, see the end).
-- BBP — base bottom panel. One exposed panel under a run of
-- base carcasses, between the end panels. The carcasses take a plain bottom
-- scribe (their own SCRBT) of its thickness; the fronts run down over its edge,
-- so it's carcass depth (cab.d). UNDER_PANEL only keeps it from blocking the
-- carcasses on the canvas (no construction effect). Right-click → Add bottom
-- panel places it. Copies BEPF's row and swaps the panel to flat.
insert into cabinet_definitions (
  name, description, category_id, assembly_class, has_carcass, has_face, has_internal, has_toekick,
  toe_type, top_type, default_dx, default_dy, default_dz, sort_order, is_library_item, active,
  custom_parts, rule_overrides, face_grid
)
select
  'BBP',
  'Base bottom panel: one exposed panel under a run of base cabinets, between the end panels. Right-click the cabinets → Add bottom panel places it and gives each a bottom scribe (Scribe Bottom) of its thickness. Carcass depth; the fronts cover its edge.',
  'fb863029-70d6-49cb-9148-863a4c1d6b31',  -- Vanity
  'base', false, false, false, false,
  toe_type, top_type, 1200, 18, 475, 110, true, true,
  '[{"x":0,"y":0,"z":0,"dx":475,"dy":1200,"dz":18,"name":"Bottom Panel","no_cnc":false,"visible":true,
     "edge_top":true,"edge_left":false,"edge_right":false,"edge_bottom":false,"sort_order":0,
     "expressions":{"dx":"cab.d","dy":"cab.w","dz":"t.exposed"},
     "material_id":null,"orientation":"flat","part_library_id":"0b364a0a-9018-4852-8ef5-172ab05dac32"}]'::jsonb,
  '{"UNDER_PANEL":true}'::jsonb,
  '{}'::jsonb
from cabinet_definitions where name = 'BEPF' and is_library_item
  and not exists (select 1 from cabinet_definitions where name = 'BBP' and is_library_item)
limit 1;

-- F7 (2026-10-21): FLOAT_BOTTOM retired — cabinets that had it carry a plain
-- SCRBT of the panel thickness instead; the BBP loses FLOAT.
update cabinet_instances set rule_overrides = (rule_overrides - 'FLOAT_BOTTOM') || '{"SCRBT":18}'::jsonb where rule_overrides ? 'FLOAT_BOTTOM';
update cabinet_instances set rule_overrides = rule_overrides - 'FLOAT' where rule_overrides ? 'UNDER_PANEL';
update cabinet_definitions set rule_overrides = rule_overrides - 'FLOAT' where rule_overrides ? 'UNDER_PANEL';

-- F8 (2026-10-21): BBP → BUP (Base Under Panel, Base › End Panels) + WUP (Wall
-- Under Panel, Wall › End Panels), same flat Under Panel part.
update cabinet_definitions set name = 'BUP', category_id = '3c39db2e-992e-459c-afa0-d1e54ddd57fc',
  description = 'Base under panel: one exposed panel under a run of base cabinets, between the end panels. Right-click the cabinets → Add under panel places it and gives each a bottom scribe (Scribe Bottom) of its thickness. Carcass depth; the fronts cover its edge.',
  custom_parts = jsonb_set(custom_parts, '{0,name}', '"Under Panel"')
  where name = 'BBP' and is_library_item;
insert into cabinet_definitions (name, description, category_id, assembly_class, has_carcass, has_face, has_internal, has_toekick,
  toe_type, top_type, default_dx, default_dy, default_dz, sort_order, is_library_item, active, custom_parts, rule_overrides, face_grid)
select 'WUP',
  'Wall under panel: one exposed panel under a run of overheads, between the end panels. Right-click the overheads → Add under panel places it and gives each a bottom scribe (Scribe Bottom) of its thickness. Carcass depth; the doors cover its edge.',
  'b1ed2843-96b0-4fad-ad9f-11128e84296d', 'wall', false, false, false, false,
  toe_type, top_type, 1200, 18, 300, 110, true, true, custom_parts, rule_overrides, '{}'::jsonb
from cabinet_definitions where name = 'BUP' and is_library_item
  and not exists (select 1 from cabinet_definitions where name = 'WUP' and is_library_item)
limit 1;
