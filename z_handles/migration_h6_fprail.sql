-- Handles H6 — finger-pull backing rails are case parts keyed `fprail:<n>`.
-- See z_handles/HANDLES-SPEC.md §7 (D11).
alter table public.case_parts drop constraint case_parts_part_key_check;
alter table public.case_parts add constraint case_parts_part_key_check check (
  part_key = any (array['left_side','right_side','bottom','back','full_top','front_rail','back_rail'])
  or part_key ~ '^(side|back|rail):[A-Za-z0-9_-]+$'
  or part_key ~ '^fprail:[0-9]+$'
);
