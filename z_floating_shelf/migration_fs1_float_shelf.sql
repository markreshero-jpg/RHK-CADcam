-- FS1 (2026-10-22): floating shelves (z_floating_shelf). A non-null `float_shelf`
-- jsonb marks a definition / instance as a floating shelf (FLSHLF) and holds its
-- settings (build, seen sides, rebate, strips, cleat, tape). Generated case
-- parts use `fs:<part>` keys.
alter table public.cabinet_definitions add column if not exists float_shelf jsonb;
alter table public.cabinet_instances   add column if not exists float_shelf jsonb;

alter table public.case_parts drop constraint case_parts_part_key_check;
alter table public.case_parts add constraint case_parts_part_key_check check (
  part_key = any (array['left_side','right_side','bottom','back','full_top','front_rail','back_rail'])
  or part_key ~ '^(side|back|rail|cleat):[A-Za-z0-9_-]+$'
  or part_key ~ '^fprail:[0-9]+$'
  or part_key ~ '^bh:[a-z_]+$'
  or part_key ~ '^crv:[a-z0-9_]+$'
  or part_key ~ '^fs:[a-z0-9_]+$'
);
