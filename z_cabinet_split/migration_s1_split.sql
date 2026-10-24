-- z_cabinet_split S1 (2026-10-24): cabinet height split.
-- cabinet_instances.split = { at: number[] } — cut heights (cabinet frame, from the
-- cabinet's bottom) where the sides and back are cut into lower / upper pieces.
-- The lower piece keeps its key; the pieces above are split:<key>:<n>.

alter table cabinet_instances add column if not exists split jsonb;

alter table case_parts drop constraint if exists case_parts_part_key_check;
alter table case_parts add constraint case_parts_part_key_check check (
  part_key = any (array['left_side','right_side','bottom','back','full_top','front_rail','back_rail'])
  or part_key ~ '^(side|back|rail|cleat):[A-Za-z0-9_-]+$'
  or part_key ~ '^fprail:[0-9]+$'
  or part_key ~ '^bh:[a-z_]+$'
  or part_key ~ '^crv:[a-z0-9_]+$'
  or part_key ~ '^fs:[a-z0-9_]+$'
  or part_key ~ '^ibp:[0-9]+$'
  or part_key ~ '^split:(left_side|right_side|back):[0-9]$'
);
