-- z_bulkhead B10 (applied 2026-11-03): long-edge mitre on case parts
-- (bulkhead bottom return front edge <-> fascia bottom edge).
alter table case_parts add column if not exists edge_mitre text check (edge_mitre in ('top','bottom','left','right'));
comment on column case_parts.edge_mitre is 'z_bulkhead B10: a long edge mitred 45 deg to the panel it meets (edge-band frame); null = square';
