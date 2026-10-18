# Per-Part View Hiding (Cabinet Vision–style "hide part")

Status: **built 2026-10-18, pending in-app check.** Part of the display layers
module. Layer sets hide a *kind* of part across the job. This hides *one part on
one cabinet* in chosen room views.

## Locked decisions (2026-10-18, user)

1. **Four ticks per part** in the cabinet editor's Parts tab: **Plan / Elev / 3D /
   All**. Ticked = the part is not drawn in that room view. "All" sets or clears
   all three (shows part-filled when only some are ticked).
2. **Nothing is ever hidden inside the cabinet edit modal.** Its plan / elevation /
   side / 3D viewers and the Parts list always show every part.
3. **Saved with the cabinet into the library.** Save-to-library copies the ticks
   onto the definition, and placing that definition copies them back onto the new
   cabinet.
4. **"Show hidden parts" override** in the header next to the Layers dropdown
   (a per-user pref, `userPrefs.showHiddenParts`). When ticked, room views draw
   hidden parts anyway, for checking.
5. **Visual only.** Cut lists, the optimiser, CNC, costing and cabinet sheets
   ignore it. A hidden part is still made.

## Where it applies

| Consumer | Filter |
|---|---|
| Room plan (CanvasSVG) + plan dimension chains | `plan` |
| Room elevation (ElevationSVG) + elevation chains | `elevation` |
| Room 3D (Room3DScene) | `3d` |
| Plan print report | `plan` (always applied, ignores the override) |
| Elevation print report | `elevation` (always applied) |
| Cut list, cabinet sheets, optimiser, CNC, edit modal | none |

## Data

- `cabinet_instances.part_hide_views jsonb` `{ "<partId>": ["plan","elevation","3d"] }`.
  Part ids use the canonical scheme (`case_<key>`, `tk_<key>_<sort>`,
  `int_<type>_<sort>`, `zone_…`, `db_<r>_<c>_<type>`, `slide_<r>_<c>_<side>`).
- `cabinet_definitions.part_hide_views jsonb`: library copy.
- `cabinet_custom_parts.hide_views text[]`: added parts carry their own list so it
  survives the id change when a library cabinet is placed (definition
  `custom_parts` snapshot → new rows).
- Migration: `migration_part_hide_views.sql` (applied 2026-10-18). The old
  all-views `cabinet_instances.hidden_parts` list (3 cabinets) became "hidden in
  all three views". That column is deprecated and no longer read. Custom parts'
  `visible` / `show_in_room` were folded into `hide_views` and set true (no UI
  edits them any more; renderers still check them, harmlessly).

## Code

- `src/lib/resolver/filterHidden.ts`: `filterHiddenParts(rp, view)` and
  `filterHiddenMap(map, view, showHidden)`. This is the single gate. It strips
  hidden parts from the resolved cabinet, so every renderer, chain and
  `cabinetShown` check downstream follows without its own visibility flag.
- `CanvasClient`: `planResolvedParts` / `elevResolvedParts` / `resolvedParts3D`,
  one per view. The raw map still feeds the edit modal and the reports modal.
- `CabinetEditModal.setHiddenViews` saves the map and syncs it live into the
  canvas map. Pressing Delete on a standard part = hide in all three room views
  (the part stays visible in the modal).
- `src/components/PartHideTicks.tsx`: the shared Plan / Elev / 3D / All ticks plus
  `PartHideContext` (get / set by part id). `CabinetEditModal` provides it, and the
  component renders nothing without a provider. Used in the Parts tab rows, the
  ortho right-click menu (`PartContextMenu`), the 3D right-click menu, and the
  docked right-hand part panel (`PartPropertiesPanel`, ortho + 3D) — added
  2026-10-18 at the user's request. `isHideablePartId` skips hinges / plates /
  override rows.
- `PartsView`: tick columns. The add/edit-part dialog has the same three ticks.
- `dbCopyCabinetChildren` (copy/paste, duplicate) copies the map from the DB.

## Open

- In-app check: tick each view, confirm plan / elev / 3D / reports, the override,
  save-to-library and place-from-library round trip.
- Library editor (`/library/cabinets`) doesn't show or edit the ticks; they only
  arrive via save-from-canvas.
