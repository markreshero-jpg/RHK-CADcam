-- Fixtures: lock group — placed fixtures sharing a lock_group move as one (src/lib/fixtureGroups.ts).
-- Applied live 2026-10-21 as fixtures_lock_group.
alter table room_fixtures add column if not exists lock_group uuid;
