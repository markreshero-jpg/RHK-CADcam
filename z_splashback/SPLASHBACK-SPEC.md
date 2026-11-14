# Splashback module — Spec & Phase Tracker

> **Purpose**: the living spec for splashbacks. Update status + decisions in the same change as the code.
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → 2026-11-14 **S2 built** (draw / select / move / stretch in elevation, Edit shape, plan
> band, 3D panel, layers). First piece drawn: RHK6468 Kitchen Wall 7, 3872 × 700 (920 → 1620), SNB Arabescato
> via "Same as Benchtop". **Check pending** (Mark). Next: **S3** — returns (Wall 7 north mitre), joints, hand
> cut-outs; then the butler's pieces (Walls 4 + 3). S2 gaps listed under "S2 as built".

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
- Not yet: job / room schedule pickers + per-role overrides in the room Materials tab (with S2, when there is
  something to resolve).

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
  thickness); not in reports / AI room summary / dashboard activity.

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
| S2 | Draw / edit in elevation (rect + Edit shape), plan band, 3D | [x] 2026-11-14, check pending; print + offline gaps |
| S3 | Returns, joints, cut-outs (+ auto from openings) | [ ] |
| S4 | Auto-build from tops | [ ] |
| S5 | Benchtop Quote section | [ ] |
| S6 | Tutorial lesson | [ ] |

## First job: RHK6468 Kitchen (drawn once S2 lands)

- Kitchen run (Wall 7): ST 20 SNB Arabescato honed, bench 920 to the PB bulkhead (700), full 3872, mitred return
  at the north end to the door jamb (Elevation 2). **Drawn 2026-11-14 (S2)** as "Splashback 1"; return waits on S3.
- Butler's north + west (Walls 4 + 3): RS reconstituted stone, colour TBC, bench to the lift-up underside 1620
  (700). South (Wall 2): window W8 920-1620, no splashback under it.
