-- z_fixtures P8: true plan shape traced from the fitted 3D model (src/lib/fixturePlanShape.ts).
-- Applied live as migration `fixtures_p8_plan_shape` (2026-10-18).
-- { v: 1, lines: [[u, v], ...][] } normalised to the item box (u = x / width, v = z / depth, 0 = back).
-- Generated in the library editor; copied onto placed fixtures like the other model fields.
alter table fixture_catalog add column if not exists plan_shape jsonb;
alter table room_fixtures   add column if not exists plan_shape jsonb;
