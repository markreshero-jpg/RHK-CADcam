-- Benchtop Phase 7: edge tape on resolved benchtop parts (applied 2026-10-14).
alter table benchtop_resolved_parts add column if not exists edgebands jsonb;
comment on column benchtop_resolved_parts.edgebands is 'Benchtop Phase 7: edge tape per part side {sides:{x0,xL,y0,yW: edge_banding.id}, mm:{tape_id: mm}}';
