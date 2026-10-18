-- B1 (2026-10-18): bulkheads (z_bulkhead). A non-null `bulkhead` jsonb marks a
-- definition / instance as a bulkhead and holds its settings (front line,
-- returns, cleat, auto height). Generated case parts use `bh:<part>` keys.
alter table public.cabinet_definitions add column if not exists bulkhead jsonb;
alter table public.cabinet_instances   add column if not exists bulkhead jsonb;

alter table public.case_parts drop constraint case_parts_part_key_check;
alter table public.case_parts add constraint case_parts_part_key_check check (
  part_key = any (array['left_side','right_side','bottom','back','full_top','front_rail','back_rail'])
  or part_key ~ '^(side|back|rail|cleat):[A-Za-z0-9_-]+$'
  or part_key ~ '^fprail:[0-9]+$'
  or part_key ~ '^bh:[a-z_]+$'
);
