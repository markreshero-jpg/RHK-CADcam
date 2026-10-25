-- z_cabinet_shape_edit E1 (2026-10-25): edge sub-types. A side edge set to
-- "Applied end panel" builds an exposed panel on the outline, outside the
-- set-in gable: case part ap:<edge id> (face-kind, like side:<edge>).
-- Same constraint as z_handles/migration_h9_linear.sql, plus `ap` in the
-- per-edge pattern.

alter table case_parts drop constraint if exists case_parts_part_key_check;
alter table case_parts add constraint case_parts_part_key_check check (
  part_key = any (array['left_side','right_side','bottom','back','full_top','front_rail','back_rail'])
  or part_key ~ '^(side|back|rail|cleat|ap):[A-Za-z0-9_-]+$'
  or part_key ~ '^fprail:[0-9]+$'
  or part_key ~ '^lh:[0-9]+$'
  or part_key ~ '^bh:[a-z_]+$'
  or part_key ~ '^crv:[a-z0-9_]+$'
  or part_key ~ '^fs:[a-z0-9_]+$'
  or part_key ~ '^ibp:[0-9]+$'
  or part_key ~ '^split:(left_side|right_side|back|(side|back):[A-Za-z0-9_-]+):[0-9]$'
);
