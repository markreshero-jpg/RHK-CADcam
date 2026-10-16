-- z_bin_cabinet B3: BBIN + BBIN+I1 library cabinets (category: Drawers).
-- Apply only once B3 code is live: before it, BBIN+I1's inner drawer would sit
-- on the cabinet floor inside the bin.

insert into cabinet_definitions (name, assembly_class, category_id, description,
  default_dx, default_dy, default_dz, has_carcass, has_internal, has_face, has_toekick,
  top_type, toe_type, face_grid, internal_grid, is_library_item, active, sort_order)
select v.name, 'base', 'fff77b33-00f7-47e8-b4e7-174c210beaa2', v.descr,
  450, 900, 580, true, true, true, true, 'front_rail', 'ladder',
  '{"cols":[{"col_index":0,"width_locked":false}],"rows":[{"row_index":0,"height_locked":false}],
    "zones":[{"col_index":0,"row_index":0,"face_type":"drawer_face","hinge_side":"left","drawer_type_config":{"type":"bin"}}]}'::jsonb,
  v.grid::jsonb, true, true, v.ord
from (values
  ('BBIN', 'Base, pull-out bin (Nikpol Teramo). The bin is picked from the inside width: 300 / 400 / 450 / 600.',
   '{"tree":{"type":"open","fittings":[]},"stack_gap":3}', 10),
  ('BBIN+I1', 'Base, pull-out bin with an inner drawer above it. Picks the tallest bin that leaves BINUP clear above; warns if none does.',
   '{"tree":{"type":"open","fittings":[{"type":"inner_drawer","y_locked":false}]},"stack_gap":3}', 11)
) as v(name, descr, grid, ord)
where not exists (select 1 from cabinet_definitions d where d.name = v.name);
