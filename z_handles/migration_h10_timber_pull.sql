-- z_handles D19 — timber pull: a linear strip handle of its own stock.
-- strip_thick_mm: the pull's thickness (null = the front's).
-- strip_material_id: its material (null = the front's; set = solid timber, no tape).
-- rebate_mm: square rebate on the back of the finger edge instead of the sharknose.
alter table public.hardware_handles
  add column if not exists strip_thick_mm    numeric,
  add column if not exists strip_material_id uuid references public.materials(id),
  add column if not exists rebate_mm         numeric;
