-- Faced doors (z_faced_doors F1): a bought-in facing (e.g. 4mm mirror) stuck on a door blank's face.
alter table public.door_catalogue
  add column if not exists facing_name         text,
  add column if not exists facing_thickness_mm numeric;

-- Resolved facing per front ({ name, thickness_mm }), persisted like door_profile.
alter table public.face_zones
  add column if not exists facing jsonb;
