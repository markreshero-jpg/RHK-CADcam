-- z_rangehood R11: cut-outs on drawer box bottoms (plumbing U notch, RHK6586 vanity).
-- outline / cutouts = what the resolve cut (cabinet_instances.part_cutouts keyed
-- db_<r>_<c>_db_bottom), read by the optimiser — same columns as case_parts.
alter table public.drawer_box_parts add column if not exists outline jsonb;
alter table public.drawer_box_parts add column if not exists cutouts jsonb;
