-- R1 (2026-11-01): part cut-outs (z_rangehood/RANGEHOOD-SPEC.md). Part key →
-- holes / notches cut in that part. Definitions hold the defaults, copied to
-- the instance at placement (job pinning). Resolved holes persist on
-- case_parts.cutouts (already there from z_curved_end C4).
alter table public.cabinet_definitions add column if not exists part_cutouts jsonb not null default '{}'::jsonb;
alter table public.cabinet_instances   add column if not exists part_cutouts jsonb not null default '{}'::jsonb;
