-- Shaped cabinets, Phase 3a — front facets (z_cabinet_shape/CABINET-SHAPE-SPEC.md).
--
-- faces: face grids for non-primary front facets, keyed by footprint edge id
--   (the primary facet keeps using face_grid).
-- facet: footprint edge id on resolved front rows/cols/zones; '' = primary front,
--   so every existing row keeps its identity and the unique keys just gain it.

alter table cabinet_instances   add column if not exists faces jsonb;
alter table cabinet_definitions add column if not exists faces jsonb;

alter table face_zones add column if not exists facet text not null default '';
alter table face_rows  add column if not exists facet text not null default '';
alter table face_cols  add column if not exists facet text not null default '';

alter table face_zones drop constraint if exists face_zones_cabinet_instance_id_row_index_col_index_key;
alter table face_zones add constraint face_zones_cabinet_facet_row_col_key unique (cabinet_instance_id, facet, row_index, col_index);
alter table face_rows  drop constraint if exists face_rows_cabinet_instance_id_row_index_key;
alter table face_rows  add constraint face_rows_cabinet_facet_row_key unique (cabinet_instance_id, facet, row_index);
alter table face_cols  drop constraint if exists face_cols_cabinet_instance_id_col_index_key;
alter table face_cols  add constraint face_cols_cabinet_facet_col_key unique (cabinet_instance_id, facet, col_index);

-- Facet zones are turned (AY) onto their facet; face_zones had no rotation columns.
alter table face_zones add column if not exists ax numeric not null default 0;
alter table face_zones add column if not exists ay numeric not null default 0;
alter table face_zones add column if not exists az numeric not null default 0;

-- Mitre bevel (degrees off square) on a zone edge where two facets meet (decision 9).
alter table face_zones add column if not exists bevel_l numeric;
alter table face_zones add column if not exists bevel_r numeric;

comment on column cabinet_instances.faces is 'Shaped cabinets: face grids for non-primary front facets, keyed by footprint edge id. See z_cabinet_shape/.';
comment on column face_zones.facet is 'Footprint edge id of the front facet; empty = primary front. See z_cabinet_shape/.';
