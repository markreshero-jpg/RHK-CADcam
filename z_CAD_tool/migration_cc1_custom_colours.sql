-- CC1 (Mark 2026-11-08): shop custom CAD colours - saved swatches in the CAD tools Colour group.
-- Applied live 2026-11-08.
alter table shop_settings add column if not exists cad_custom_colours text[] not null default '{}';
