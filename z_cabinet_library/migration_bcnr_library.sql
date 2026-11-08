-- Blind corner base (Mark 2026-11-08): BCNR/L and BCNR/R — one carcass, a door +
-- a fixed false panel across the blind end. /L /R = the blind side (cabinet-codes:
-- "/L /R — hinge side (singles) or blind side (corners)"); the door is hinged off
-- the blind panel. Blind (false panel) width = the return run's carcass depth +
-- its door + 2 + 40 → 560 + 18 + 2 + 40 = 620 by default; set per placement (the AI
-- works it out from the actual return run). A 40 face filler goes at the start of
-- the return run. Inside: B1D's adjustable shelf, changed per job.
-- Copied from B1D (everything else — construction, materials, toekick — the same),
-- in BCNP's corner subcategory.

with src as (select * from public.cabinet_definitions where name = 'B1D' limit 1),
     sub as (select category_id, subcategory_id from public.cabinet_definitions where name = 'BCNP' limit 1),
     v(name, face_grid) as (values
  ('BCNR/L', '{"rows":[{"row_index":0,"height_locked":false}],
               "cols":[{"col_index":0,"width":620,"width_locked":true},{"col_index":1,"width_locked":false}],
               "zones":[{"row_index":0,"col_index":0,"face_type":"false_panel"},
                        {"row_index":0,"col_index":1,"face_type":"door","hinge_side":"left"}]}'::jsonb),
  ('BCNR/R', '{"rows":[{"row_index":0,"height_locked":false}],
               "cols":[{"col_index":0,"width_locked":false},{"col_index":1,"width":620,"width_locked":true}],
               "zones":[{"row_index":0,"col_index":0,"face_type":"door","hinge_side":"right"},
                        {"row_index":0,"col_index":1,"face_type":"false_panel"}]}'::jsonb)
)
insert into public.cabinet_definitions
select (jsonb_populate_record(null::public.cabinet_definitions,
  to_jsonb(src) || jsonb_build_object(
    'id', gen_random_uuid(), 'name', v.name, 'default_dx', 1000, 'face_grid', v.face_grid,
    'category_id', sub.category_id, 'subcategory_id', sub.subcategory_id,
    'created_at', now(), 'updated_at', now()))).*
from src, sub, v
where not exists (select 1 from public.cabinet_definitions d where d.name = v.name);
