-- z_rangehood R12: the WRHSO library item (Wall › Appliances) — generic slide-out rangehood cabinet
-- (Mark 2026-11-16, first use RHK6571 WC-03 Westinghouse WRR626SB).
-- Copied from WRH: pair of doors, full top, one fixed shelf (locked at shelf_h), flue notch + flue box.
-- Differences: Bottom Type none (the hood body screws between the gables), the doors stop 42 above the
-- underside (40 visor fascia + 2) — a locked 40 open row under them + the 2 reveal = door bottom 42 up (row 0 = bottom; face rows count up) — and the rangehood block is
-- mount 'slideout': body full width between the gables (hole.w null), 300 deep from the front
-- (the under panel is notched that deep from its front edge), shelf at 300.
insert into cabinet_definitions (name, description, category_id, subcategory_id, assembly_class, has_carcass, has_face, has_internal, has_toekick,
  toe_type, top_type, bottom_type, default_dx, default_dy, default_dz, sort_order, is_library_item, active, face_grid, internal_grid, rule_overrides, rangehood, part_cutouts)
select 'WRHSO',
  'Slide-out rangehood cabinet: no bottom - the hood body screws between the gables; the doors stop 42 above the underside so the 40 visor slides out under them; under panel notched from the front for the body (300 deep, set in the Rangehood section); fixed shelf at 300 above the hood with a 200 x 250 flue notch, the same notch in the top, and the flue box.',
  w.category_id, w.subcategory_id, 'wall', true, true, true, false,
  w.toe_type, 'full_top', 'none', 600, w.default_dy, w.default_dz, 1, true, true,
  '{"cols":[{"col_index":0,"width_locked":false},{"col_index":1,"width_locked":false}],
    "rows":[{"row_index":0,"height":40,"height_locked":true},{"row_index":1,"height_locked":false}],
    "zones":[{"col_index":0,"row_index":0,"face_type":"open"},
             {"col_index":1,"row_index":0,"face_type":"open"},
             {"col_index":0,"row_index":1,"face_type":"door","hinge_side":"left"},
             {"col_index":1,"row_index":1,"face_type":"door","hinge_side":"right"}]}'::jsonb,
  w.internal_grid,
  '{}'::jsonb,
  '{"mount":"slideout","hole":{"w":null,"d":300,"setback":0,"offset":0,"radius":0},"flue":{"w":200,"d":250,"offset":0},"shelf_h":300}'::jsonb,
  '{}'::jsonb
from cabinet_definitions w
where w.name = 'WRH' and w.is_library_item
  and not exists (select 1 from cabinet_definitions where name = 'WRHSO' and is_library_item)
limit 1;
