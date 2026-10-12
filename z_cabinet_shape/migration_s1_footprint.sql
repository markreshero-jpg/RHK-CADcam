-- Shaped cabinets, Phase 1 — footprint column (z_cabinet_shape/CABINET-SHAPE-SPEC.md S-a).
-- Null = plain rectangle (existing resolver path, decision 5). Shape:
--   { preset, params, from_preset, segments: [{ type, start, end, start_expr?, edge: { id, role, finish? } }] }
-- segments are the source of truth (decision 8); start_expr holds the vertex formulas.

alter table cabinet_instances   add column if not exists footprint jsonb;
alter table cabinet_definitions add column if not exists footprint jsonb;

comment on column cabinet_instances.footprint   is 'Shaped-cabinet plan outline + edge roles; null = rectangle. See z_cabinet_shape/.';
comment on column cabinet_definitions.footprint is 'Shaped-cabinet plan outline + edge roles; null = rectangle. See z_cabinet_shape/.';
