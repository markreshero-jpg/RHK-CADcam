# Splashback module — Spec & Phase Tracker

> **Purpose**: the living spec for splashbacks. Update status + decisions in the same change as the code.
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → 2026-11-14 **S2 built** (draw / select / move / stretch in elevation, Edit shape, plan
> band, 3D panel, layers). First piece drawn: RHK6468 Kitchen Wall 7, 3872 × 700 (920 → 1620), SNB Arabescato
> via "Same as Benchtop". **Check pending** (Mark). Next: **S3** — returns (Wall 7 north mitre), joints, hand
> cut-outs; then the butler's pieces (Walls 4 + 3). 2026-11-15 **S2b** closed the S2 gaps (prints, reports,
> offline, plan pick, Materials tab, override fix) — see "S2b as built"; check pending.
> 2026-11-15 **S3 built**: returns, slab joints, hand cut-outs (see "S3 as built"); Wall 7 north return set (wrap
> round the wall end, mitre, 140 — length TBC on site). Check pending. 2026-11-15 butler's pieces drawn
> (Walls 4 + 3). 2026-11-15 **S4 built** (F4 → Auto-build splashbacks…, see "S4 as built"); check pending.
> Next: S5 Benchtop Quote section, S6 tutorial.

## Mark's brief (2026-11-14)

- "Work like benchtops do": draw it, Edit shape, etc.
- **Its own material schedules**: splashbacks are often glass (or tile, mirror…) on a stone bench, so they
  can't follow the benchtop's stone schedule.
- Was "Deferred: Splashback module" in `z_benchtop_builder/BENCHTOP-SPEC.md`.

## What a splashback is (PROPOSED)

A flat panel standing **in a wall's plane**, on the face side, sitting on a benchtop (or the floor / a
cabinet), drawn and edited in **elevation** the way a benchtop is drawn and edited in plan.

- Belongs to one wall + side (`wall_id`, `wall_side` face/back), like an anchored benchtop. One splashback
  per wall run; corners meet with a joint (butt / mitre), same rule as [benchtops one per wall].
- Outline = Shape Editor segments in the **wall's elevation frame** (x along the wall from its start, y up from
  the floor). Default rectangle: bench top → underside of the overheads / rangehood / bulkhead.
- Thickness from its material (20 stone, 6 glass, 12 ply-backed tile…), sitting on the wall face (or set off it
  by `offset_mm` for a packer / batten).
- **Returns**: an edge can turn the corner as a return piece (E2 on RHK6468: "mitre stone around wall to the
  door jamb") — `edge.return = { length_mm, join: 'mitre' | 'butt' }`, drawn on the adjacent face.
- **Cut-outs**: rectangles / rounded rects for GPOs, switches, windows sills, rangehood, tap / pot filler.
  Openings (windows / doors) in the wall cut it automatically, with an editable reveal (default 0).

## Data (PROPOSED)

- `splashback_instances` — `room_id, label, wall_id, wall_side, segments (Shape Editor, elevation frame),
  cutouts, edges (per segment: exposed / wall / joint / return, profile_id, edgeband / polish), offset_mm,
  splashback_schedule_id, build_method_id, notes`.
- `splashback_schedules` + `splashback_schedule_rows` (role → material), seeded: 20mm Stone, 12mm Stone,
  6mm Toughened Glass (colour-backed), Tile (by others), Mirror 6mm, Acrylic / compact laminate.
- Materials: reuse `benchtop_materials` (stone / timber already there) + new `material_type`s `glass`,
  `tile`, `mirror`, `acrylic`; **or** a separate `splashback_materials` — **Mark to pick** (Q2).
- Job / room / instance cascade like benchtops: `job_splashback_materials`, `room_splashback_materials`.

## Drawing (PROPOSED)

- **Elevation**: outline + fill pattern per material type (stone hatch, glass diagonals, tile grid); label
  "SPLASHBACK - <material>"; cut-outs; joints. Editable here (drag edges, Edit shape, add cut-out).
- **Plan**: thin band on the wall face (dashed under overheads); returns shown.
- **3D**: extruded panel, material colour, glass slightly transparent.
- **Auto-build**: per wall, from the benchtop's wall edges up to the lowest of: overheads' underside,
  rangehood, bulkhead, room height − soffit; across the benchtop's length; stops at talls / windows.

## Outputs (PROPOSED)

- Benchtop Quote report gets a Splashbacks section (m², cut-outs count, polished edges, returns, joins) per
  material — stone + splashback on one sheet for the stonemason; glass on its own list.
- Not CNC'd (stone / glass by others).

## Locked decisions (2026-11-14)

- **L1 Draw first, auto later**: hand drawing (S2) comes before auto-build (S4).
- **L2 Windows**: the splashback stops at a window, cut around the opening (reveal default 0, editable).
  A sill / reveal wrap can be added later as a return.
- **L3 Default height with no overheads**: up to the lowest of bulkhead underside, rangehood, room height.
- **L4 Inherit benchtop stone**: a setting, `shop_settings.splashback_inherits_benchtop` (default true).
  When on, an empty splashback schedule role takes the room's benchtop worktop material.
- **L5 Materials (OK'd by Mark 2026-11-14)**: no separate splashback library. A `splashback_schedule_rows` row
  names a material from **either** library, using the same two nullable FKs `benchtop_schedule_rows` already
  has: `material_id` → `materials` (board stock + board colours, e.g. a WB 16.5 or laminate board splashback) or
  `benchtop_material_id` → `benchtop_materials` (stone, timber, and new types `glass`, `tile`, `mirror`,
  `acrylic`). Board splashbacks can then be cut parts (thickness from the board); surface ones are
  supply-only, as stone tops are.
- **L6 Roles**: `panel` (the splashback), `substrate` (backing board behind tile / glass), `packer`
  (battens when set off the wall). A row holds one library's id only (CHECK constraint). A job / room
  override replaces the whole choice for its role (a board override clears a stone id).

## S1 as built (2026-11-14)

- Migration `migration_s1_splashback_schedules.sql` (applied live): `splashback_schedules`,
  `splashback_schedule_rows`, `job_splashback_materials`, `room_splashback_materials` (RLS: library read /
  admin write; job_access), `projects.splashback_schedule_id`, `rooms.splashback_schedule_id`,
  `shop_settings.splashback_schedule_id` + `splashback_inherits_benchtop` (default true).
- Seeded surface materials: 12mm Stone, 6mm Toughened Glass – Colour Backed, Tile – By Others, 6mm Mirror,
  6mm Acrylic Splashback (notes `seed: splashback S1`). Benchtop material Type list gains Timber, Glass, Tile,
  Mirror.
- Seeded schedules: **Same as Benchtop** (default, no panel row → inherits), 20mm Stone, 12mm Stone, 6mm
  Glass – Colour Backed, Tile – By Others (+ WB 16.5 substrate), 6mm Mirror, Board – Whiteboard 16.5. Shop
  default = Same as Benchtop.
- Cascade: `src/lib/splashbackMaterials.ts` — `pickSplashbackScheduleId` (instance → room → job → shop →
  is_default), `effectiveSplashbackRows` (job then room overrides, then inherit), `benchtopPanelMaterial`
  (stone_slab, else worktop_panel). Tests `src/lib/__tests__/splashbackMaterials.test.ts`.
- UI: Schedules library › Splashbacks tab (one dropdown per role, Benchtop and Board libraries grouped, banding
  on a board panel); Settings › Materials › Splashbacks default + "Splashback uses benchtop material".
- Fixed in passing: the Schedules library asked for a non-existent `benchtop_schedules.benchtop_id` column.
- Job / room schedule pickers + per-role overrides in the Materials tab: built in S2b.

## S2 as built (2026-11-14)

- Table `splashback_instances` (`migration_s2_splashback_instances.sql`, applied live; RLS job_access; wall FK
  cascades): `wall_id, wall_side, segments` (elevation frame), `cutouts` (S3), `offset_mm`, `thickness_mm`
  (null = material), `opening_reveal_mm`, `splashback_schedule_id`, `label`, `notes`.
- Geometry `src/lib/splashbackGeometry.ts` (+ tests): rect / bounds / stretchEdge / move, `defaultSplashbackRect`
  (L3), `sbOpenings` + `openingHoles` (L2, live from the wall's openings, grown by the reveal), `sbElevPath`,
  `sbPlanQuad`, `sbFrame` (= elevationFrame).
- Canvas: `useSplashbacks` (catalog, `infoFor` = material / kind / thickness / board-or-supply via the S1 cascade;
  inherit uses the benchtop on the same wall, else the room's first top), `SplashbackElevation` (fill per kind:
  stone hatch, glass diagonals, tile 100 grid, board plain; label + size; select → drag to move, orange handles
  stretch a rectangle's edges), `SplashbackPanel` (left / width / bottom / height, schedule, thickness, off wall,
  reveal, Edit shape, notes, delete), `SplashbackShapeEditor` (y flipped in/out; wall, cabinets, tops, openings
  as ghosts), `Splashback3D` (extruded off the face, glass see-through), plan band in `CanvasSVG`.
- Sidebar Benchtop (F4) section › **Draw Splashback** → elevation: click a bench = default size, or drag a
  rectangle. Selection type `splashback`; Delete key; undo / redo; wall delete takes its splashbacks.
- Layers: `splashbacks` (all views) + `splashback_labels` (elevation) in the Benchtops group (now "Benchtops &
  splashbacks").
- **Gaps (later):** not on the shop-drawing / print elevations (`ElevationPrintSVG`) or plan report; not in the
  offline room copy (`roomCache`); plan band can't be clicked where cabinets cover it (select in elevation / 3D);
  the inherit lookup ignores benchtop job / room per-role overrides (same known gap as the benchtop display
  thickness); not in reports / AI room summary / dashboard activity. → all closed in S2b.

## S2b as built (2026-11-15) — the S2 gaps

- **Prints:** `SplashbackElevation` has a `print` mode (ink pens, white fill + material hatch, haloed label, no
  handles; hatch ink set on the pattern lines — `currentColor` took the page text colour). Drawn by
  `ElevationPrintSVG` (Elevation Views + Shop Drawings elevations), a grey band on the wall face in
  `PlanViewReportSVG` (Plan View, Benchtop Quote, Shop Drawings plan — drawn over the bench, since it stands above
  it), and in the 3D shots (`Room3DCapture` / `Room3DRender`: shop drawing 3D views + 3D Colour Render).
  Bundle type `SbPrint` (`useSplashbacks.ts`): the room's pieces + `info`.
- **Job Reports:** `ReportsModal` loads the job's `splashback_instances`; `useSplashbacks.forRoom(room, tops,
  rowsFor)` gives the material cascade for any room (room overrides now loaded for every room of the job).
- **Benchtop Supply:** surface splashbacks are order lines after each room's tops (`src/lib/splashbackSupply.ts`
  + tests): size, area less window holes, holes listed as cut-outs, outline thumbnail when shaped. Board
  splashbacks stay off (cut parts, L5). `SupplyLine.role` gains `'splashback'`.
- **Offline:** `splashbacks` in the room copy (`roomCache`, optional — older copies have none) and the offline canvas.
- **Plan pick:** bands carry `data-sb-id`; a cabinet click over one opens the stacked pick list with the
  splashback in it (`splashbacksAtPoint`, `CabinetPickerMenu` `splashbacks`).
- **Materials tab** (`MaterialsScheduleTab`): Splashbacks schedule in Schedule Assignments (room) / at the top of
  the Splashbacks block (Job Properties, which hides assignments); Panel / Substrate / Packer overrides pick from
  surfaces or boards (`surface:` / `board:` values); blank Panel shows "same as the benchtop" when inherit is on.
- **Override fix (benchtops too):** a job / room override replaces the role's whole choice — `loadBenchtopInput`
  and `useBenchtopCatalog.applyOverrides` no longer keep the schedule's other-library id; the benchtop override
  save clears the other column. (Live data had no double-id rows.) The splashback inherit now follows benchtop
  overrides (scheduleRowsFor already applied them).
- Dashboard: `room_last_activity()` includes `splashback_instances` (`migration_s2b_room_activity.sql`, applied).
  Delete-room counts list splashbacks. AI room summary lists them (label | wall | x range | heights | schedule);
  the AI still can't edit them.
- Not done: the canvas reloads job / room splashback overrides only on open (as benchtops).

## S3 as built (2026-11-15)

- Columns `returns`, `joints` (jsonb, default `[]`) on `splashback_instances`
  (`migration_s3_returns_joints.sql`, applied live). `cutouts` (unused polygon list, all rows empty) is now a list
  of cut-out records. Types `SbCutout`, `SbReturn` (`src/lib/types.ts`).
- **Cut-outs**: `{ id, kind: gpo | switch | rect | round, x, y, w, h }`, x / y = bottom-left measured from the
  piece's bottom-left (they move with the piece; stretching the left edge shifts them). Default sizes
  (`CUTOUT_PRESETS`): Double GPO 125 × 70, Switch / single GPO 70 × 115, Cut-out 100 × 100, Round Ø35 —
  editable, **check against the fittings**. New ones land mid-piece, centred 150 above the bottom. Holes in
  elevation (GPO / SW tag), prints, 3D; dragged in elevation when the piece is selected.
- **Joints**: vertical slab joints (butt), mm from the piece's left edge. "+ Joint" halves the longest piece; drag
  the joint in elevation. Dashed line in elevation / prints. Supply: one line per piece ("piece 1 of 2"), butt join
  on each side, cut-outs to the piece holding their centre.
- **Returns**: per end (as seen in the elevation): `dir` **back** = wrap round the wall end / external corner
  (into the wall — the RHK6468 door-jamb case; default length = wall thickness + panel, mitre) or **out** = inside
  corner toward the room (default 100, butt); `length_mm` = overall, long point (panel thickness included).
  Geometry `sbReturnGeos` (local plan frame) → plan polygons (`sbPlanPolys`: band + return + the corner block a
  back return adds to the main piece), elevation strip seen edge-on + "RETURN 140 MITRE", 3D extrusion. Supply:
  the return is its own line (height × length, long point for a mitre, short for a butt); a back return adds the
  panel thickness to the main piece; the join is listed on both lines.
- Not done: a return isn't drawn on the adjacent wall's elevation (an 'out' return would be seen face-on there);
  returns follow the piece's height at that end, not their own shape. Corner meets between two splashbacks on
  adjoining walls are just drawn to length (no linked joint).

## S4 as built (2026-11-15)

- `src/lib/splashbackAutoBuild.ts` (+ tests) `autoBuildSplashbacks`: per wall face a top's edges sit against
  (`wallContacts`, grouped by bench height), one piece along that stretch from the bench surface up to the
  **lowest overheads' underside / drop bulkhead over the run, else the wall top** (L3) — one height, as a click in
  Draw Splashback gives (the first try stepped up to the ceiling wherever the overheads stopped short of a run
  end; dropped). A wall-hung fixture lower than that (rangehood) steps the top down over its own width only.
- Split by anything standing through the band (talls, a fridge — bottom under bench + 150, top above it) and by a
  window whose sill is within 50 of the bench (L2); a higher window stays a live hole. Pieces under 100 dropped.
- Inside corners: where two pieces meet, the shorter stops short by the other's thickness (its material); a new
  piece meeting one already drawn always stops short. A face stretch that already has a splashback is listed as
  skipped — auto-build never replaces or edits drawn pieces.
- UI: F4 → **Auto-build splashbacks…** (`SplashbackAutoBuildDialog`): each proposed piece with a thumbnail, size,
  x range, heights, notes (corner stops, splits); tick which to build → `useSplashbacks.createMany` (one undo
  step, labels continue "Splashback n", notes "Auto-built (S4)").
- RHK6468 Kitchen check (dialog only, not built): Wall 7 3872 × 700, Wall 4 3055 × 700, Wall 3 700 high — all
  skipped as drawn, matching the hand pieces; proposes Wall 1 640 × 1480 and Wall 2 105 × 1480 by the W7 drawers
  (no overheads there → wall top). Not built — Mark's call.
- Not done: no plan preview in the dialog (list + elevation thumbnails); a top's front edge never gets one
  (islands with a wall: only edges against a wall face count).

## Questions for Mark (original; answers above)

1. Auto-build splashbacks from the tops (like Auto-build tops), or draw each by hand first?
2. Materials: extend the benchtop material library with glass / tile / mirror types, or a separate
   splashback material library?
3. Window sills: splashback stops at the window, or the stone wraps the sill / reveal?
4. Default height when there are no overheads (e.g. a kitchen run under a bulkhead, RHK6468): to the
   bulkhead underside, or a set height (e.g. 600 / 700)?
5. Should a stone splashback be able to be the **same piece** as the benchtop's material by default
   (inherit when the job schedule says so), with glass etc. as overrides?

## Phases

| Phase | What | Status |
|---|---|---|
| S0 | Spec + Mark's answers | [x] 2026-11-14 |
| S1 | Tables + schedules + seed materials | [x] 2026-11-14, check pending (instances table moved to S2) |
| S2 | Draw / edit in elevation (rect + Edit shape), plan band, 3D | [x] 2026-11-14, check pending |
| S2b | S2 gaps: prints, reports + supply, offline, plan pick, Materials tab, override fix | [x] 2026-11-15, check pending |
| S3 | Returns, joints, cut-outs (+ auto from openings) | [x] 2026-11-15, check pending |
| S4 | Auto-build from tops | [x] 2026-11-15, check pending |
| S5 | Benchtop Quote section | [ ] |
| S6 | Tutorial lesson | [ ] |

## First job: RHK6468 Kitchen (drawn once S2 lands)

- Kitchen run (Wall 7): ST 20 SNB Arabescato honed, bench 920 to the PB bulkhead (700), full 3872, mitred return
  at the north end to the door jamb (Elevation 2). **Drawn 2026-11-14 (S2)** as "Splashback 1"; return added
  2026-11-15 (S3): right end, wrap round the wall end, mitre, 140 (Wall 6 is 120 + 20 stone) — length to the jamb
  TBC. 3872 long: a slab joint may be needed (not added — stonemason / Mark).
- Butler's north + west (Walls 4 + 3): RS reconstituted stone, colour TBC, bench to the lift-up underside 1620
  (700). South (Wall 2): window W8 920-1620, no splashback under it. **Drawn 2026-11-15**: "Butler's north"
  Wall 4 x 0-3055 (to the tall panel TC-08), "Butler's west" Wall 3 x 0-2680 (butts into the north piece at the
  NW corner). Material inherits the top on the same wall; the Kitchen's room stone (YDL Super Arabescato) was
  overriding the butler's RS schedule, so the three butler's tops got a per-top stone (C5) = RS Colour TBC.
