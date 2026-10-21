-- z_floating F6: BBP — base bottom panel. One exposed panel under a run of
-- floating carcasses, between the end panels. The carcasses take a bottom
-- scribe of its thickness (FLOAT_BOTTOM); the fronts run down over its edge,
-- so it's carcass depth (cab.d). UNDER_PANEL keeps it from blocking the
-- carcasses on the canvas; FLOAT places it at the floating height (300).
-- Copies BEPF's row and swaps the panel to flat.
insert into cabinet_definitions (
  name, description, category_id, assembly_class, has_carcass, has_face, has_internal, has_toekick,
  toe_type, top_type, default_dx, default_dy, default_dz, sort_order, is_library_item, active,
  custom_parts, rule_overrides, face_grid
)
select
  'BBP',
  'Base bottom panel: one exposed panel under a run of floating cabinets, between the end panels. Tick Bottom panel on the cabinets over it (they scribe up by its thickness). Carcass depth; the fronts cover its edge.',
  'fb863029-70d6-49cb-9148-863a4c1d6b31',  -- Vanity
  'base', false, false, false, false,
  toe_type, top_type, 1200, 18, 475, 110, true, true,
  '[{"x":0,"y":0,"z":0,"dx":475,"dy":1200,"dz":18,"name":"Bottom Panel","no_cnc":false,"visible":true,
     "edge_top":true,"edge_left":false,"edge_right":false,"edge_bottom":false,"sort_order":0,
     "expressions":{"dx":"cab.d","dy":"cab.w","dz":"t.exposed"},
     "material_id":null,"orientation":"flat","part_library_id":"0b364a0a-9018-4852-8ef5-172ab05dac32"}]'::jsonb,
  '{"FLOAT":true,"UNDER_PANEL":true}'::jsonb,
  '{}'::jsonb
from cabinet_definitions where name = 'BEPF' and is_library_item
  and not exists (select 1 from cabinet_definitions where name = 'BBP' and is_library_item)
limit 1;
