-- MC12 (2026-11-05, applied as mc11_material_opacity): material opacity for 3D display. null = opaque; 0..1 = see-through
-- (glass). Display only - cut lists / optimiser ignore it.
alter table public.materials add column if not exists opacity numeric
  check (opacity is null or (opacity > 0 and opacity <= 1));
comment on column public.materials.opacity is '3D display opacity (null = opaque, e.g. 0.5 for glass). Display only.';
update public.materials set opacity = 0.5 where name = 'Glass 6mm – Clear Toughened';
