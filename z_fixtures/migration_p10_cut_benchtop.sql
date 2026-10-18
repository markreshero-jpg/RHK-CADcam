-- z_fixtures P10: "Cut benchtop" tick box — turn a fixture's cutout off without
-- losing its size. Applied live as migration `fixtures_p10_cut_benchtop` (2026-10-18).
-- On both the catalogue row (default for new placements) and the placed (job) copy.
alter table fixture_catalog add column if not exists cut_benchtop boolean not null default true;
alter table room_fixtures   add column if not exists cut_benchtop boolean not null default true;

comment on column fixture_catalog.cut_benchtop is 'Cutout template cuts the benchtop under it (copied to placements; false = keep the size but no hole)';
comment on column room_fixtures.cut_benchtop   is 'This placement cuts the benchtop under it (false = no hole; cutout_* kept)';
