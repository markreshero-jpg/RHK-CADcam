-- L1b (2026-10-15): top rails stand on edge by default (rule RAIL_ORIENT,
-- 'vertical' | 'horizontal'). An upright rail keeps DX = RD (now its height),
-- DY = length, DZ = thickness; its box maps like a back panel (caseBox).
-- Applied.
alter table case_parts add column if not exists upright boolean not null default false;
