# Job Versions, Alternatives & Change Log

Status: **Spec only — nothing built** (2026-11-08). Open questions answered 2026-11-08. Next: V1.
Date: 2026-11-08
Related: `z_dashboard/migration_room_last_activity.sql` (dashboard "Recently worked on"),
`z_resolver_persist/RESOLVER-PERSIST.md` (resolved part tables), `z_CAD_tool/ANNOTATION-SPEC.md`
(G1 protected CAD), `z_ai_helper/AI-HELPER-SPEC.md` (ai_batches undo), `z_access_control/`,
memory "job version pinning model" (jobs static, library changes only via Update job).

## Why

Today the app has no way to see what changed on a job, go back to an earlier state,
or try a second layout without wrecking the first:

- Canvas undo/redo (`useCanvasHistory.ts`) only lives while the room is open.
- Revisions exist only for one cabinet's part / shape overrides.
- `ai_batches` undoes AI-helper edits only.
- Supabase backups restore the **whole database**, not a job.
- Drawing revisions ("rev 4", "rev 8") are tracked by hand in each job's JOB-NOTES.md and git.

## What we're building

| Part | What Mark sees |
|---|---|
| **Versions** | **Save version** on a room ("Rev 3 – sent to client"). A versions list per room with **Restore**. Restoring saves the current state first, so a restore can always be undone. |
| **Alternatives** | **Save as alternative** copies a room into the same job ("Kitchen – Option B (island)") to work on separately. Keep either, delete the other. |
| **Change log** | A **History** panel per job: who changed what, when, in plain words ("Mark · 8 Nov 12:31 · Kitchen · B3DR-600 width 600 → 650"). |

## Phases

| Phase | Scope | Status |
|---|---|---|
| **V1** | `room_versions` table + save / list / restore RPCs. Versions panel in the canvas (File → Versions…) and a clock icon on each dashboard room row. Auto version before every restore. | not started |
| **V2** | **Optimise?** tick per room (decision 17). **Save as alternative** (copy room, new ids, Optimise? off). **Restore as alternative** (version → new room). Alternatives shown on the dashboard and room switcher. | not started |
| **V3** | **Save job version**: one click versions every room in the job under one label. Milestone versions (decision 9): status changes, optimiser / CNC output, shop drawing PDFs, Update job, AI helper batches, automation scripts. | not started |
| **V4** | `change_log` table filled by database triggers + History panel (job and room). | not started |
| **V5** | Dashboard "Recently worked on" reads the change log (fixes deletes / wall moves not counting). Tutorial lessons for V1–V4. | not started |

## Locked decisions

### Versions (V1)

1. **Versions are per room.** A "job version" (V3) is just one version per room sharing a
   `batch_id` and label. Job-level settings (job materials, schedules, door styles on
   `projects`) are **not** in a room version — they're pinned per job already and change
   rarely; revisit if Mark needs it.
2. **A version is a verbatim copy of every row under the room**, stored as one `jsonb`
   document keyed by table name — including the **resolved part tables**. Restoring then
   needs no re-resolve, and keeps hinge edits, part overrides and shape edits exactly as
   they were. Biggest room today (42 cabinets with parts + CAD) ≈ 170 kB, so size is fine.

   Tables copied (all FK'd to the room or its cabinets / benchtops):

   | Level | Tables |
   |---|---|
   | Room row | `rooms` (settings only — not `id`, `project_id`, `name`, `sort_order`) |
   | Room | `walls`, `cabinet_instances`, `benchtop_instances`, `room_fixtures`, `room_annotations`, `kick_runs`, `grain_match_groups`, `room_materials`, `room_benchtop_materials`, `room_drawerbox_materials`, `room_toekick_materials` |
   | Cabinet | `case_parts`, `face_rows`, `face_cols`, `face_zones`, `hinge_instances`, `internal_parts`, `drawer_box_parts`, `toekick_parts`, `cabinet_custom_parts`, `joint_instances`, `part_shape_overrides` |
   | Benchtop | `benchtop_resolved_parts` |

   **Not copied:** `ai_messages` / `ai_batches` (chat history isn't drawing state),
   optimiser `nest_jobs` (saved runs stay as they were run).

   The table list lives in **one place** (a SQL function both save and restore read).
   Any new table that hangs off a room / cabinet must be added there — same rule as the
   display-layer registry.
3. **Restore keeps the original row ids.** It deletes the room's current rows and
   re-inserts the snapshot rows with their saved ids, in **one transaction** (all or
   nothing). Same ids mean every internal reference (cabinet → wall, annotation →
   cabinet, kick run → cabinet, grain-match members, ids inside JSON) stays valid with no
   remapping.
4. **Restore always auto-saves first** ("Before restore to *Rev 3*", kind `auto`). Nothing
   is ever lost by restoring.
5. **Schema drift:** restore inserts only the columns present in the snapshot, so columns
   added since get their database defaults. Columns since dropped are ignored. Each
   version records the app's `schema_version` for diagnosis.
6. **Library drift:** if a snapshot row points at a library item that no longer exists
   (deleted cabinet definition, material, door style), restore **stops before changing
   anything** and lists what's missing. No half-restores.
7. **Protected CAD (G1):** a restore is a whole-room swap the user asked for, saved first,
   so it's allowed to replace annotations. When the G1 trigger goes live it must let
   the restore RPC through (session flag `app.restoring = on`), and nothing else.
8. **Kinds:** `named` (someone typed a label — kept forever), `milestone` (decision 9 —
   kept forever), `auto` (before restore / AI / automation — keep the newest 30 per room,
   older ones pruned).
9. **No timed / daily versions** (Mark, 2026-11-08). Versions are created by hand, or
   automatically **at moments that matter**, so there's always a copy of the room as it
   was when something left the building or was about to be changed by a machine:

   | Moment | Kind | Label |
   |---|---|---|
   | Job status changes (Quoted, Approved, In production, Completed) | milestone | "As quoted", "As approved", … — every room in the job (V3 batch) |
   | Optimiser run saved / G-code sent to CNC | milestone | "As cut – run 12" — rooms in the run |
   | Shop drawings / plan PDF exported | milestone | "As drawn – PDF 8 Nov" — only if the room changed since its last version |
   | **Update job** (library refresh, when built) | milestone | "Before Update job" |
   | Restore | auto | "Before restore to *Rev 3*" |
   | AI helper batch / Claude Code automation script | auto | "Before AI: change overhead doors…" / "Before automation: rev 5" |

   A moment that would save a copy identical to the room's latest version is skipped
   (compare a hash of the snapshot), so repeated PDF exports don't pile up versions.
10. **Access:** admin and tester can both **save and restore** (Mark, 2026-11-08).
    Deleting a named / milestone version is admin only. RLS on `room_versions` follows
    the room's project like every other job table.
11. **Where:** canvas **File → Versions…**, and a clock icon on each room row on the
    dashboard (Mark, 2026-11-08).
12. **The canvas reloads after a restore** (simplest correct thing — undo stack, resolved
    caches and 3D all start clean). Undo history from before the restore is dropped.

### Alternatives (V2)

13. **An alternative is an ordinary room** with `rooms.alternative_of` → the room it was
    copied from, and a label in the name ("Kitchen – Option B"). Everything in the app
    already works on it.
14. **Copying gives every row a new id.** The copy reads the room as a snapshot (same
    function as V1), swaps every copied uuid for a fresh one **everywhere in the
    document** (columns and inside JSON), then inserts. Because uuids are unique, a plain
    find-replace of the copied ids is safe and catches references we'd forget to map by hand.
15. **Restore as alternative** = the same copy, starting from a saved version instead of
    the live room.
16. **"Make this the main"** swaps names/`sort_order` and the **Optimise?** ticks with the
    original and clears `alternative_of`; the old main becomes the alternative. Nothing is
    deleted automatically.
17. **Optimise? tick per room** (Mark, 2026-11-08: "we need an optimise? button somewhere
    so we can filter it out"). New column `rooms.include_in_optimise boolean not null
    default true`, shown as an **Optimise?** tick on each dashboard room row and in Room
    Properties.
    - The optimiser loads only ticked rooms. Unticked rooms are listed greyed under the
      Rooms filter ("not included — tick Optimise? to add") so it's obvious why parts are
      missing.
    - Job-wide reports (benchtop quote, takeoff, job material totals) follow the same
      tick. Room reports for the room you're in are unaffected.
    - **Alternatives are created unticked.** Restoring a version doesn't change the tick.
    - It's per room, not per cabinet: the existing per-cabinet / per-part `no_cnc` stays
      for leaving single items off the machine.

### Change log (V4)

18. **Database triggers write the log**, so it records every change however it was made:
    canvas, AI helper, Claude Code automation scripts, restores, SQL fixes.
19. **Logged tables:** the things people edit — `projects`, `rooms`, `walls`,
    `cabinet_instances`, `benchtop_instances`, `room_fixtures`, `room_annotations`,
    `kick_runs`, room/job material tables. **Not** the resolved part tables (they're
    regenerated by the resolver and would bury real changes in noise).
20. **Each entry stores:** when, who (`auth.uid()`), source (`canvas` / `ai` /
    `automation` / `restore` / `sql`, from a `set_config('app.change_source', …)` the
    caller sets; default `sql`), job, room, table, row id, action (insert / update /
    delete), and for updates **only the columns that changed** (old → new), skipping
    `updated_at` and resolver-written columns (`resolved_drawer_hw`, etc.).
    Deletes keep the whole old row, so "what was there" is always answerable.
21. **Drag noise is merged:** repeated updates to the same row by the same person within
    60 s update the existing log entry (keeping the first "old" value and the latest
    "new" value) instead of adding a new one.
22. **History panel** groups entries by person + room + a few minutes ("Mark · Kitchen ·
    12 changes · 12:31") with an expand to the details. Words come from the client:
    cabinet code + position, wall number, field labels the edit modals already use.
23. **Keep log entries for 2 years** (jobs are revisited 2–3 years later), then prune.

## Answered questions (2026-11-08)

1. Versions live in **File → Versions…** and on the dashboard room row — as proposed.
2. **No automatic daily version.** Milestone versions instead (decision 9).
3. Alternatives are filtered out with an **Optimise?** tick per room (decision 17).
4. **Testers can save and restore.**

## Database sketch (V1 + V2)

```sql
create table room_versions (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references rooms(id) on delete cascade,
  project_id     uuid not null references projects(id) on delete cascade,
  batch_id       uuid,                    -- V3 job version: same id across the job's rooms
  label          text not null,
  kind           text not null check (kind in ('named','milestone','auto')),
  snapshot_hash  text,                    -- skip a milestone identical to the last version
  note           text,
  snapshot       jsonb not null,          -- { "<table>": [rows…], … }
  counts         jsonb not null,          -- { cabinets: 42, walls: 6, … } for the list
  schema_version text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);
create index on room_versions (room_id, created_at desc);

alter table rooms add column alternative_of uuid references rooms(id) on delete set null;
alter table rooms add column include_in_optimise boolean not null default true;

-- RPCs (security invoker → RLS applies)
-- room_snapshot(room)                 → jsonb          (shared by save + copy)
-- save_room_version(room, label, kind, note) → version id
-- restore_room_version(version)       → auto-saves, then swaps rows in one transaction
-- copy_room(room | version, new_name) → new room id    (V2, uuid remap)
```
