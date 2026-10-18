-- z_fixtures P11 — resizable models.
-- resizable: the model follows the item's width / depth when it's stretched
--   (banded stretch from the model's own spec, else a plain scale to the box).
-- stretch: the GLB's scene extras "stretch" block (bands per axis, rigid nodes),
--   copied in when the library traces the model; placed rows copy both.

alter table fixture_catalog add column if not exists resizable boolean not null default false;
alter table fixture_catalog add column if not exists stretch jsonb;
alter table room_fixtures   add column if not exists resizable boolean not null default false;
alter table room_fixtures   add column if not exists stretch jsonb;
