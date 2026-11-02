-- z_rangehood R3: cut-outs on custom parts (the WUP's Under Panel is one).
-- part_cutouts = the user's Cutout[] list (same shape as cabinet_instances.part_cutouts
-- entries); outline / cutouts = what the resolve cut from it (written back, like dx / dy),
-- read by the optimiser and the 3D views — same columns as case_parts.
alter table public.cabinet_custom_parts add column if not exists part_cutouts jsonb not null default '[]'::jsonb;
alter table public.cabinet_custom_parts add column if not exists outline jsonb;
alter table public.cabinet_custom_parts add column if not exists cutouts jsonb;
