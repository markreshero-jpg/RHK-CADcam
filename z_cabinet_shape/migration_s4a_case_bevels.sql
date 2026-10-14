-- z_cabinet_shape Phase 4a: angled carcass joints.
-- Vertical panels of a shaped cabinet carry their angled ends: degrees from
-- square at the low / high end of the part's length axis (+ = inner face
-- shorter). The part's dx/dy is the blank. Null = square.
alter table case_parts add column if not exists bevel_lo numeric;
alter table case_parts add column if not exists bevel_hi numeric;
