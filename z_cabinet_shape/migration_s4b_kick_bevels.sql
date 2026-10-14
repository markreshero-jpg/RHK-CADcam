-- z_cabinet_shape Phase 4b: toe kick follows the footprint.
-- Mitred kick boards carry their end cuts: degrees from square at local
-- x = 0 / x = DY (+ = back face shorter); dx/dy is the blank. Null = square.
-- Turned boards use the existing ay column.
alter table toekick_parts add column if not exists bevel_lo numeric;
alter table toekick_parts add column if not exists bevel_hi numeric;
