-- z_rangehood R7: the WRH library item (Wall › Appliances).
-- An undermount rangehood cabinet: W2D carcass + pair of doors, one fixed shelf
-- (the rangehood block locks it at 350 from the underside incl. the under panel),
-- and the rangehood block with the hole size unset (warns until the appliance's
-- cut-out size is entered). The WUP under it comes from right-click → Add under panel.
insert into cabinet_categories (name, sort_order, parent_id, active)
select 'Appliances', 4, '2e644b96-fc00-47c4-8350-2594de6eff01', true
where not exists (select 1 from cabinet_categories where name = 'Appliances' and parent_id = '2e644b96-fc00-47c4-8350-2594de6eff01');

insert into cabinet_definitions (name, description, category_id, subcategory_id, assembly_class, has_carcass, has_face, has_internal, has_toekick,
  toe_type, top_type, default_dx, default_dy, default_dz, sort_order, is_library_item, active, face_grid, internal_grid, rule_overrides, rangehood)
select 'WRH',
  'Undermount rangehood cabinet: pair of doors, hole through the bottom (and the WUP under it), fixed shelf at 350 with a 200 x 250 flue notch, the same notch in the top, and a flue box (2 sides + front, carcass board) screwed through the shelf and top. Set the hole size from the rangehood''s cut-out spec in the Rangehood section.',
  (select id from cabinet_categories where name = 'Appliances' and parent_id = '2e644b96-fc00-47c4-8350-2594de6eff01' limit 1),
  w.subcategory_id, 'wall', true, true, true, false,
  w.toe_type, 'full_top', 600, w.default_dy, w.default_dz, 0, true, true, w.face_grid,
  '{"tree":{"type":"open","fittings":[{"type":"fixed_shelf","y_locked":false}]}}'::jsonb,
  '{}'::jsonb,
  '{"hole":{"w":null,"d":null,"setback":50,"offset":0,"radius":0},"flue":{"w":200,"d":250,"offset":0},"shelf_h":350}'::jsonb
from cabinet_definitions w
where w.name = 'W2D' and w.is_library_item
  and not exists (select 1 from cabinet_definitions where name = 'WRH' and is_library_item)
limit 1;
