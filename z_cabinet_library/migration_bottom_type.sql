-- Bottom type (2026-11-02): per-cabinet / per-definition override of the
-- construction method's BOTTOM_TYPE rule. null = follow the method (default 'full').
--   full  = bottom panel
--   rails = front + back bottom rails (flat, RD deep, bottom material)
--   none  = no bottom
alter table cabinet_instances   add column if not exists bottom_type text
  check (bottom_type in ('full', 'rails', 'none'));
alter table cabinet_definitions add column if not exists bottom_type text
  check (bottom_type in ('full', 'rails', 'none'));
