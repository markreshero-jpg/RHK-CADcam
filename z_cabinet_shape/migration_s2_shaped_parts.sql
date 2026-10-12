-- Shaped cabinets, Phase 2 — per-edge case parts + resolver outlines
-- (z_cabinet_shape/CABINET-SHAPE-SPEC.md Phase 2).
--
-- case_parts.part_key: the seven box keys, plus per-footprint-edge parts
--   side:<edge> / back:<edge> (angled panels) and rail:<edge> (facet top rails).
-- outline: resolver-generated non-rectangular outline (bottom / top / shelves),
--   sampled points in the part's Shape Editor frame. Null = rectangle.

alter table case_parts drop constraint if exists case_parts_part_key_check;
alter table case_parts add constraint case_parts_part_key_check check (
  part_key = any (array['left_side','right_side','bottom','back','full_top','front_rail','back_rail'])
  or part_key ~ '^(side|back|rail):[A-Za-z0-9_-]+$'
);

alter table case_parts     add column if not exists outline jsonb;
alter table internal_parts add column if not exists outline jsonb;

comment on column case_parts.outline     is 'Resolver outline for shaped cabinets (z_cabinet_shape); null = rectangle.';
comment on column internal_parts.outline is 'Resolver outline for shaped cabinets (z_cabinet_shape); null = rectangle.';
