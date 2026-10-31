-- VJ line layout cascade (job → room → cabinet → door).
-- { qty, spacing, edge_gap, direction } — each key optional; null/absent = inherit.
-- The door (front) level lives in the cabinet's face_grid JSONB zone as `vj`.
-- RLS: projects / rooms / cabinet_instances already have their policies.

alter table projects          add column if not exists vj_layout jsonb;
alter table rooms             add column if not exists vj_layout jsonb;
alter table cabinet_instances add column if not exists vj_layout jsonb;

comment on column projects.vj_layout is 'VJ line layout default for the job: {qty, spacing, edge_gap, direction}; blank keys = door profile';
comment on column rooms.vj_layout is 'VJ line layout override for the room; blank keys inherit the job';
comment on column cabinet_instances.vj_layout is 'VJ line layout override for the cabinet; blank keys inherit the room';
