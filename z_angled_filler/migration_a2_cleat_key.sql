-- A2 (2026-10-15): return cleats behind angled corner fillers when the support
-- carcass is off — case part key `cleat:<side edge id>` (z_angled_filler).
alter table public.case_parts drop constraint case_parts_part_key_check;
alter table public.case_parts add constraint case_parts_part_key_check check (
  part_key = any (array['left_side','right_side','bottom','back','full_top','front_rail','back_rail'])
  or part_key ~ '^(side|back|rail|cleat):[A-Za-z0-9_-]+$'
  or part_key ~ '^fprail:[0-9]+$'
);
