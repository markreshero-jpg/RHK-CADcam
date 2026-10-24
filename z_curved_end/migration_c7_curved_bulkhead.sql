-- z_curved_end C7 + z_bulkhead B7 (2026-10-24): curved bulkhead + shadowline split rail board.
-- No schema change: the split lives in cabinet_*.bulkhead jsonb (`split`), the curved
-- bulkhead is a definition carrying both `bulkhead` and `curved_end`.

-- Rail board for the shadowline split (default for bulkhead.split.material_id).
insert into materials (name, brand, finish, dz, pad, sheet_dx, sheet_dy, trim_top, trim_left, trim_right, trim_bottom,
  has_grain, back_colour, cnc_tool_id, edge_colour, face_colour, feed_rate_pct, active)
select 'MDF 10mm', 'Generic', 'Raw', 10, pad, sheet_dx, sheet_dy, trim_top, trim_left, trim_right, trim_bottom,
  false, back_colour, cnc_tool_id, edge_colour, face_colour, feed_rate_pct, true
from materials where name = 'MDF 18mm'
  and not exists (select 1 from materials where name = 'MDF 10mm');

-- BHCRVFIXP: WCRVFIXP's curved end (ribs 0 = top + bottom formers only) hung like a
-- bulkhead (BH's category; height to the ceiling; no straight fascia / returns / cleat).
insert into cabinet_definitions (
  name, description, assembly_class, category_id, subcategory_id, is_library_item, active,
  default_dx, default_dy, default_dz, preserve_dx, preserve_dy, preserve_dz,
  has_carcass, has_internal, has_face, has_toekick, toe_type, top_type, face_grid,
  curved_end, bulkhead)
select 'BHCRVFIXP',
  'Curved bulkhead: a curved end (face board pocketed to bend round the curve, formers, fixing panel, back) hung from the ceiling like a bulkhead, over a curved end below. Optional shadowline split rail in the bulkhead section.',
  'wall', bh.category_id, bh.subcategory_id, true, true,
  500, 300, 600, false, false, false,
  false, false, false, false, w.toe_type, w.top_type, '{}'::jsonb,
  w.curved_end || '{"ribs": 0}'::jsonb,
  jsonb_build_object('kind', 'bulkhead', 'front', 'doors', 'auto_h', true, 'cleat', false,
    'left', bh.bulkhead->'left', 'right', bh.bulkhead->'right', 'bottom', bh.bulkhead->'bottom',
    'split', jsonb_build_object('on', false, 'width', 60, 'setback', 10,
      'material_id', (select id from materials where name = 'MDF 10mm' limit 1)))
from cabinet_definitions w, cabinet_definitions bh
where w.name = 'WCRVFIXP' and bh.name = 'BH' and w.is_library_item and bh.is_library_item
  and not exists (select 1 from cabinet_definitions where name = 'BHCRVFIXP');
