# Resolver persistence

Status: **done** (2026-10-13). Migration: `migration_atomic_persist.sql` (applied).

## Why

`persistResolved` used to delete every part row for a cabinet and then re-insert
table by table, about 9 sequential round trips (~3 s), with `face_zones` last.
Any interruption in between (a reload, navigating away, a dev-server hot reload,
a failed request) left a carcase with no fronts in the DB. The room 3D draws from
the DB, so drawers and doors vanished until the cabinet was opened in the editor.
On top of that, every page load re-resolved and re-saved every drawer cabinet,
because drawer stacks and slides were never saved. That kept the window open on
every load.

## Locked decisions

1. **One transactional RPC.** `persist_resolved_cabinet(p_cab, p)` deletes and
   re-inserts all part tables, links `face_zones.row_id/col_id` by
   (facet, index), merges `hinge_instances` by (cabinet, row, col, sort_order) and
   resolves hinge mounting part ids from mount keys, all in one transaction. It
   `SELECT … FOR UPDATE`s the cabinet row to serialise same-cabinet saves.
   The client payload is built by `buildPersistPayload` (row objects keyed by
   column name).
2. **Drawer hardware is saved** as JSON in
   `cabinet_instances.resolved_drawer_hw` (`{ drawer_stacks, internal_slides }`),
   written by the same RPC. `dbLoadResolvedParts` reads it, so the room loads
   drawers without re-resolving.
3. **Load-time re-resolve only for incomplete saves.** `dbLoadResolvedParts(ids,
   needsResolve)` flags a cabinet when it has drawers but no saved hardware
   (saved before this change), or face rows but no fronts (an old interrupted
   save). Everything else draws straight from the DB.

## Measured (room "38 Howard / Kitchen", 19 cabinets, dev server)

| Page load | Before | After |
|---|---|---|
| Resolve + save calls | 7 cabinets (×2 in dev StrictMode) | 0 |
| REST requests | 257 | 58 |
| Save per cabinet | ~9 sequential round trips | 1 RPC |

## Not done

- `loadCabinetInput` still reads its inputs in ~3 rounds on a full resolve; a
  single read RPC would make that 1.
- The Supabase project is in `ap-southeast-1`; Sydney would cut every round trip.
