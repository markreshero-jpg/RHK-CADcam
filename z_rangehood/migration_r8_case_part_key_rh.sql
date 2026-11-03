-- z_rangehood R8 fix: the flue box parts (rh:flue_l / rh:flue_r / rh:flue_front)
-- were rejected by case_parts_part_key_check, so a WRH's parts failed to save
-- (found on the first real use, RHK6586 WC-04). Same check + `rh:`.
alter table public.case_parts drop constraint if exists case_parts_part_key_check;
alter table public.case_parts add constraint case_parts_part_key_check check (
  part_key = any (array['left_side','right_side','bottom','back','full_top','front_rail','back_rail'])
  or part_key ~ '^(side|back|rail|cleat|ap):[A-Za-z0-9_-]+$'
  or part_key ~ '^(fprail|fpbase):[0-9]+$'
  or part_key ~ '^lh:[0-9]+$'
  or part_key ~ '^bh:[a-z_]+$'
  or part_key ~ '^crv:[a-z0-9_]+$'
  or part_key ~ '^fs:[a-z0-9_]+$'
  or part_key ~ '^ibp:[0-9]+$'
  or part_key ~ '^rh:[a-z0-9_]+$'
  or part_key ~ '^split:(left_side|right_side|back|(side|back):[A-Za-z0-9_-]+):[0-9]$'
);
