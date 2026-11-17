-- z_paint_shop P1b (2026-11-18): Paint Shop Sheet is Satin Board only (Mark),
-- matched by board name in the report — the Painted flag is dropped.
alter table materials drop column if exists is_painted;
