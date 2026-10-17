-- z_fixtures P5: doors / windows / archways as the 'opening' fixture category.
-- Applied live as migration `fixtures_p5_openings` (2026-10-18).
-- An opening sits IN its wall: depth = wall thickness, z = sill height.
-- hinge_side = hinge (or slide-to) side looking from inside the room; swing = door swings into the room or out.
alter table fixture_catalog drop constraint if exists fixture_catalog_category_check;
alter table fixture_catalog add constraint fixture_catalog_category_check
  check (category in ('appliance', 'sink', 'tap', 'decorative', 'opening'));

alter table room_fixtures
  add column if not exists hinge_side text not null default 'left' check (hinge_side in ('left', 'right')),
  add column if not exists swing      text not null default 'in'   check (swing in ('in', 'out'));
