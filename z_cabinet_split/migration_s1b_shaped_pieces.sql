-- z_cabinet_split (2026-10-25): shaped cabinets' per-edge side / back panels are cut too,
-- so a piece key can carry an edge id: split:back:back2:1, split:side:end:1.
alter table case_parts drop constraint if exists case_parts_part_key_check;
alter table case_parts add constraint case_parts_part_key_check check (
  part_key = any (array['left_side','right_side','bottom','back','full_top','front_rail','back_rail'])
  or part_key ~ '^(side|back|rail|cleat):[A-Za-z0-9_-]+$'
  or part_key ~ '^fprail:[0-9]+$'
  or part_key ~ '^bh:[a-z_]+$'
  or part_key ~ '^crv:[a-z0-9_]+$'
  or part_key ~ '^fs:[a-z0-9_]+$'
  or part_key ~ '^ibp:[0-9]+$'
  or part_key ~ '^split:(left_side|right_side|back|(side|back):[A-Za-z0-9_-]+):[0-9]$'
);
