-- Handles D24 — set back SQ edge finger pull: grip kind 'setback', and the set back
-- rail's flat base piece as case parts keyed `fpbase:<n>`.
-- See z_handles/HANDLES-SPEC.md D24. The part-key check is the live one (2026-11-01) + fpbase.
alter table public.hardware_handles drop constraint hardware_handles_grip_kind_check;
alter table public.hardware_handles add constraint hardware_handles_grip_kind_check check (
  grip_kind = any (array['hardware','sharknose','setback','routed','push','rail','channel','linear'])
);

alter table public.case_parts drop constraint case_parts_part_key_check;
alter table public.case_parts add constraint case_parts_part_key_check check (
  part_key = any (array['left_side','right_side','bottom','back','full_top','front_rail','back_rail'])
  or part_key ~ '^(side|back|rail|cleat|ap):[A-Za-z0-9_-]+$'
  or part_key ~ '^(fprail|fpbase):[0-9]+$'
  or part_key ~ '^lh:[0-9]+$'
  or part_key ~ '^bh:[a-z_]+$'
  or part_key ~ '^crv:[a-z0-9_]+$'
  or part_key ~ '^fs:[a-z0-9_]+$'
  or part_key ~ '^ibp:[0-9]+$'
  or part_key ~ '^split:(left_side|right_side|back|(side|back):[A-Za-z0-9_-]+):[0-9]$'
);
