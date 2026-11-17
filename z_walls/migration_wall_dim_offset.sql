-- Per-wall dimension row outset (2026-11-17, RHK6586 Kitchenette: at the 45° corner Wall 2's
-- rows ran past the corner into Wall 1's). Real mm added to the wall's row offset, plan + print.
-- Helper: src/lib/geometry.ts wallDimOffset. Edited in the Wall panel ("Dim rows out").
alter table public.walls add column if not exists dim_offset numeric;
comment on column public.walls.dim_offset is
  'Extra outset (mm) of this wall''s dimension rows on the plan + printed plan. Null / 0 = standard spacing.';
