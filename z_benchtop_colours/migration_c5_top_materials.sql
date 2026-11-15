-- z_benchtop_colours C5 (2026-11-15): per-top material override.
-- Mark: "there should be able to have a cabinet material schedule and also a per benchtop schedule".
-- Same shape as job_/room_benchtop_materials; cascade job → room → this top (top wins).
create table if not exists public.benchtop_instance_materials (
  id                   uuid primary key default gen_random_uuid(),
  benchtop_id          uuid not null references public.benchtop_instances(id) on delete cascade,
  part_role            text not null,
  material_id          uuid references public.materials(id),
  benchtop_material_id uuid references public.benchtop_materials(id),
  edgeband_id          uuid references public.edge_banding(id),
  unique (benchtop_id, part_role)
);

alter table public.benchtop_instance_materials enable row level security;
create policy job_access on public.benchtop_instance_materials for all to authenticated
  using ((select public.is_admin()) or public.can_access_benchtop(benchtop_id))
  with check ((select public.is_admin()) or public.can_access_benchtop(benchtop_id));
