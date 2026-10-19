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
5. **Visual only** for partial hides (Plan / Elev / 3D in any mix short of all
   three). Cut lists, the optimiser, CNC, costing and cabinet sheets ignore them.
   ~~A hidden part is still made.~~ Superseded for "All" by Removed below.

## Removed = hidden in all views (2026-10-19, user — Cabinet Vision behaviour)

Used for system parts that can't be deleted (left gable, back, bottom…) and
aren't wanted anywhere. Status: **built 2026-10-19 (R1–R5), pending in-app check.**

R-D1. **All three views ticked = Removed (not made).** No separate tick; "All"
      is the switch. Delete on a standard part = Removed (already sets all three).
R-D2. A removed part is **off the cut lists, the optimiser (gone, not just
      unticked), CNC and costing**. No costing module exists yet; the rule binds
      it when built (it must read the gated sources below).
R-D3. **No drilling caused by the part.** Its seam joints (cams / dowels / pins on
      the neighbours), master operations, hinge plates (removed door), slide holes
      (removed front / box), finger-rail notches all drop. Ops on the part itself
      go with it.
R-D4. **Geometry unchanged.** Neighbours keep their size and position (unlike
      `BACK_TYPE = none`). The resolver is not touched; gating is downstream.
R-D5. The edit modal still shows the part (decision 2 stands) so it can be
      un-removed; the Parts tab marks the row "Removed" (struck through), and
      the No CNC tick shows as implied.
R-D6. Hardware: a removed door drops its hinges from the cabinet sheet's
      hardware block; a removed drawer front drops its slides.

### Build plan
- R1 `isRemoved` / `removedIds(rp)` in `filterHidden.ts` (custom parts: their
  own `hide_views` holding all three).
- R2 Optimiser: loaders select `part_hide_views`; `normalize.push()` skips
  removed parts.
- R3 Drilling: filter `rp.seam_joints` (either part removed) before
  `cabinetSeamDrills` (covers CNC + 2D drill drawings); `seamDrillSync` hinge /
  slide / notch loops skip removed sources and targets; `fireMasters.partGeoms`
  leaves removed ids out (neither source nor target).
- R4 Reports: `ReportsModal.collectParts` and `CabinetSheetSVG.cutRows` +
  hardware block skip removed parts.
- R5 UI: Parts tab "Removed" row state + tooltips ("All = removed, not made").

## No CNC tick (added 2026-10-18, user)

Hiding is visual only, so a separate **No CNC** tick sits next to the hide ticks
(Parts tab column, docked part panels, right-click menus). Ticked = the part is
still drawn and listed but goes to the optimiser unticked (`output_to_cnc =
false`), so it isn't nested or cut.

- Resolved parts: `cabinet_instances.part_no_cnc jsonb` (array of part ids, same
  id scheme as below); library copy `cabinet_definitions.part_no_cnc`, carried by
  save-to-library, placement and copy/paste like the hides.
- Custom parts: their existing `cabinet_custom_parts.no_cnc` column (the tick in
  the add/edit-part dialog is the same flag).
- Read in `normalizeProject` (`src/lib/optimiser/normalize.ts`). The assembly-wide
  `cabinet_instances.no_cnc` still overrides everything (no UI for it yet).
- Cut lists and cabinet sheets still show the part.
- Migration: `migration_part_no_cnc.sql` (applied 2026-10-18).

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

### Removed — as built (2026-10-19)
- `filterRemovedParts(rp)` / `removedIds` / `isAllViews` in `filterHidden.ts` are
  the gate: parts, seam joints touching them (`seamPartId` maps bare case keys),
  hinges of removed doors or plated to removed parts, runners of removed fronts.
- Applied in `collectDrillRows` + `collectNotchRoutes` (seamDrillSync),
  `fireMasters` (partGeoms), `cabinetSeamDrills` (seams only, so the editor's 2D
  drill drawings match), `normalize.push()` (part dropped; custom parts via their
  own `hide_views`), and ReportsModal's map (cut lists + cabinet sheets).
- Known gap: shaped finger-pull rails notch the side's *outline* in the resolver
  (`notchPanels`); removing such a rail leaves that outline notch. Plain rail
  notch routes do drop.
- At build time 3 cabinets already had all-view hides (Kitchen: "Filler" and
  "BC-26" kick parts, "WC-01" back) — those are now removed.
