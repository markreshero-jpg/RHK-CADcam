-- C4 (2026-10-21): rib cut-outs (z_curved_end/CURVED-END-SPEC.md).
-- case_parts.cutouts: inner closed loops cut inside a part before its
-- perimeter, each with the onion skin it leaves (0 = through):
--   [{ "pts": OutlinePt[] (same frame as `outline`), "skin": mm }]
-- persist_resolved_cabinet takes its columns from the row keys, so nothing else changes.
alter table public.case_parts add column if not exists cutouts jsonb;
