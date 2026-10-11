-- Benchtop Phase 3b — wall anchor + height override (spec P-e / P-g).
-- Applied as migration `benchtop_p3b_anchor`.
--
-- wall_id / wall_side: the wall (and side) a top belongs to, same meaning as a
-- cabinet's wall_id + cabWallSide. Existing rows are anchored by the canvas on
-- load (geometry lives in TS: benchtopAnchor.autoAnchor), so no backfill here.
-- Deleting a wall leaves the top unanchored; the canvas re-anchors it.
-- height_mm: optional UNDERSIDE height (the top sits on it; surface = it +
-- thickness); null = the base-height cascade (Mark 2026-10-11, P-c revised).

alter table benchtop_instances
  add column if not exists wall_id   uuid references walls(id) on delete set null,
  add column if not exists wall_side text not null default 'face'
    check (wall_side in ('face', 'back')),
  add column if not exists height_mm numeric;

create index if not exists benchtop_instances_wall_id_idx on benchtop_instances(wall_id);
