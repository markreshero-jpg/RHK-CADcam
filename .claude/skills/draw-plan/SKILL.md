---
name: draw-plan
description: Draw a kitchen/room in the CAD canvas from a customer PDF plan, headlessly (no visible browser). Use when asked to draw, reproduce, or "do a drawing" from a PDF in z_sample_plans or elsewhere.
---

# Draw a room from a PDF plan

Reproduce a printed Resident Hero plan (plan view + elevations + 3D sheets) as a
room in the app, using `z_plan_automation/draw-plan.mjs`. The script drives the
dev app's `window.__canvasApi` bridge through headless Chrome so everything goes
through the real placement/resolve pipeline — you only produce a layout JSON.

## Procedure

0. **If the plan is marked up with cabinet codes** (B2D, D3-SLL, BEPF, BFK…),
   load the `cabinet-codes` skill — it defines the code grammar. Codes name
   the carcass configuration; dimensions still come from the plan.
1. **Read the PDF** with the Read tool, AND read
   `references/cabinet-vision-conventions.md` (next to this file) — it decodes
   the real Cabinet Vision drawing conventions: multi-area jobs, `# n`
   numbering, panel thicknesses inline in dim chains (16.5/18/30/40.5/5),
   per-job kick heights, appliance gaps, islands, elevation symbols.
   Simple test plans: sheet 1 = plan view with dim chains; following sheets =
   one elevation per wall, then a 3D view.
   **If the input is a hand-drawn site sketch** (z_site_sketches, or anything
   hand-sketched rather than CAD-printed), ALSO read
   `references/site-sketches.md` — it decodes Pencil's sketch shorthand
   (OH counts, drawer tick marks, "seen end", end-of-run depth notes,
   bench-off-tile heights) and its rules win over the CV doc for sketches.
2. **Fill the intake checklist** — `references/job-intake-checklist.md`. Work
   through it against the PDF, then show the user the filled template with any
   unresolved items as questions BEFORE placing anything. Only proceed once
   the questions are answered (or the user says defaults are fine).
3. **Build a layout JSON** (schema below, example:
   `z_plan_automation/layouts/rhk1234-kitchen-test-room.json`) using the reading
   conventions below. Save it under `z_plan_automation/layouts/`.
4. **Check the dev server** is up: `curl -s -H "x-dev-automation: 1" http://localhost:3001/`.
   If not, ask the user to run `! npm run dev` (a Claude-started background dev
   server dies at turn boundaries, so within a turn you may start one yourself,
   but check the port first — the user often already has it running).
5. **Run**: `node z_plan_automation/draw-plan.mjs z_plan_automation/layouts/<name>.json`
   (from the repo root). It creates the room, draws, applies dy overrides,
   verifies parts from the DB, and ends with a RESOLVER REPORT (re-resolves
   every cabinet via `__canvasApi.getIssues()`; resolver errors count as
   failures, warnings are informational). Exit 0 + "all checks passed" = done.
6. Report the room name/id, any FAIL lines, and any resolver errors/warnings.
   To re-check an existing room later without redrawing:
   `node z_plan_automation/resolver-report.mjs <roomId>` (exit 0 clean /
   2 warnings / 3 errors).

## Walls — MUST be drawn clockwise (user's explicit rule)

Draw walls **head-to-tail in a clockwise rotation**: each wall ends exactly
where the next starts, and consecutive directions turn clockwise (right turns,
in screen coords with y down). Otherwise corners overlap and the wall's
start/end are flipped, so offsets and elevations read mirrored. The script
refuses layouts that violate this.

Example L-room (interior below/right): left wall from its south end **up to**
the corner — `{x:0, y:2000, angle:270, length:2000}` — then top wall from the
corner east — `{x:0, y:0, angle:0, length:3216.5}`.

The wall line is the interior face; thickness (default 90) extrudes outward.
On standard walls cabinets always face the room centroid, so facing
self-corrects — direction matters for offsets/elevations, not facing.

**Islands are different (changed 2026-07-29):** an island wall's face side is
the fixed **left-perp of its draw direction** ({-dy, dx}, y-down screen
coords), NOT the centroid. Drawn west→east (angle 0) the face is SOUTH; drawn
east→west (angle 180) the face is NORTH. Pick the draw direction so the face
side lands where the fronts belong; `flip: true` puts a cabinet on the other
side. Getting this wrong puts every island cabinet on the wrong side of the
line and mirrors the island elevation.

## Reading the plan

- **Elevation left edge = wall start** (when walls are clockwise). So
  `placeCabinet` offsets map 1:1 to the elevation read left→right. Number the
  walls so Elevation 1 = Wall 1, etc.
- **Plan dim chains**: the segment occupied by the return run (the "corner
  gap", typically 600) sits at the corner end of the chain. Cross-check each
  wall's chain against its elevation before deciding which cabinet is
  corner-adjacent — this is where mistakes happen.
- **Small gaps like 16.5** between a base run and a tall are panel-thickness
  gaps drawn in the plan: leave them empty (offset the next cabinet past them)
  unless told otherwise.
- **Heights** (`dy` includes the kick, excludes benchtop):
  - Base: elevation "140 kick + 740" → `dy: 880` (class default is 900 — always
    check the elevation).
  - Tall/pantry: 2100 default (140 + 1220 + 740) — usually no override needed.
  - Overheads (wall class): height from the elevation (e.g. 600). Vertical
    position is derived at render as `(room.wall_cabinet_top ?? 2100) - dy` —
    stored pos_z is ignored for wall class, so a 600-high unit automatically
    sits 1500–2100. Only `dy` needs setting.
- **Door material — CHECK, never assume**: query the job's door panel
  thickness before computing filler cuts/offsets (projects table:
  `default_door_style_id` + per-class `*_door_style_id` → `door_styles` →
  `door_catalogue.thickness_mm`). Front assembly = panel + 2mm buffer; it
  drives corner-filler geometry (see cabinet-vision-conventions.md).
- **Cabinet definitions** (query `cabinet_definitions` if unsure): `B2` = base
  with doors (any width via dx), `D2` = 2-drawer base, `Wall Unit` = overhead,
  `Tall Cabinet` = pantry, `End Panel`, `Filler`, `P2-3ID` = pantry with
  internal drawers. Drawer fronts in an elevation (stacked horizontals with
  handles) = D2; an X across a front = door(s).
- **Fillers default to the on-kick defs** — `TFK` / `TFKW` (tall), `BFK` / `BFKW`
  (base) — with the kick joined through underneath
  (`__canvasApi.joinKicks(label)` after placement). Only end panels run to the
  floor; use `TFF` / `TFFW` only when the user says so (Mark, 2026-10-21).
- **Blind corners → always a filler on the adjacent wall's run, next to the
  blind cabinet, default 40 wide** (Mark, RHK6555 2026-10-27). The blind false
  panel runs at least 40 past that run's fronts (adjacent carcass dz + door + 2
  + 40 from the corner wall), and the door is **hinged off the blind panel**.
  No blind-corner def yet: a `B1D` at the blind width with face_grid col 0
  `door` (`hinge_side` toward the blind side) + col 1 `false_panel`,
  `width` locked (e.g. 635 for a 575 carcass), plus a `BFK` 40 at the start of
  the adjacent run (same kick_run_id / has_toekick / pos_z / dy as the run's
  members if the kick is already joined).
- **Inner drawers next to a wall → 50 filler** (not 30), so the door opens far
  enough to clear the drawers. If a cupboard with inner drawers / pull-outs sits
  against a wall, either use a 50 TFKW/BFK there or ASK before drawing
  (Mark, 2026-10-22). Only a WALL counts: beside a seen end panel (open end)
  the door swings past 90°, so inner drawers there need no filler (Mark,
  2026-10-23). When the run is fixed (e.g. 2300 OA) keep the cupboard widths
  round (750) and let the wall filler take up the rest (32).
- **Sink cabinets → rails always vertical** (Mark, 2026-10-22): any cabinet
  with a sink (sink/basin on the plan, a BSK-type def, or a vanity under a
  basin) gets its top rails on edge — `"rules": { "RAIL_ORIENT": "vertical" }`
  on that cabinet in the layout JSON (same as the "Rails: on edge" select in
  CabinetPanel). Never leave a sink cabinet on the horizontal default.
  `RAIL_ORIENT` only sets the FRONT rail. The back rail of a double rail stays
  flat (`BACK_RAIL_ORIENT`, default horizontal) unless Mark asks for it on
  edge (2026-10-29).
- **Finger-pull rails run the whole run** (Mark, 2026-10-29): a finger-pull
  backing rail is one length across the cabinets added together, not one per
  cabinet. Over 2400 it splits where two cabinets meet. The optimiser does
  this itself (`joinFingerRails`, z_handles D19): rails that line up on the
  wall at the same height, depth and board join end to end. So keep the fronts
  of a run level and the cabinets touching. A gap between cabinets, or a
  different height or depth, breaks the run into separate rails. With top
  rails on edge (sink cabinets) the front rail fixes the top finger rail, so it
  gets no knock-in blocks (D20). The resolver does this, so there is nothing
  to set.
- **Hinges vs adj-shelf holes**: the resolver errors `HINGE_SHELF_HOLE_CLASH`
  when a hinge plate sits over shelf-pin holes. Fix by setting the door's
  manual `face_grid.zones[].hinges` (along the door from its bottom), moving
  hinges up where they fit, otherwise down. `HINGE_FIXED_SHELF_CLASH` (error) is
  the same for a plate on a fixed shelf's thickness — fixed shelves are screwed
  to the gable, so the hinge must move. Remember a shelf "top at 920 AFFL" sits
  at carcass Y 820 on a 100 kick, and hinge positions are from the door bottom.
- **Drawer boxes: don't take the tallest box that squeezes in** (Mark,
  2026-10-23). Since 4dfc14d every system box sits 16.5 above its own front
  (so the 64-up front holes match on every drawer), and that lift counts in the
  fit — ~188 fronts (D4 at 762 carcass) now auto-pick 127, not 178. To force a
  size anyway: drawer zone `drawer_type_config: {type:'system', slide_product_id:
  <Dragon Pro <len>x127>}` in `face_grid.zones`, then nudge dy to re-resolve.
- **Inner drawers behind hinged doors → 95-high boxes with hinges in the gaps**
  (Mark, 2026-10-23). Use the 95 Dragon Pro (`slide_product_id` of
  `Dragon Pro <len>x95` in `hardware_slides`, `height: 95`) so the gaps between
  fronts fit a hinge (`HINGE_INNER_DRAWER_CLASH` needs a cup ≥ 32 from any
  front edge; 83 gaps work). Lock each drawer's `y_position` (cabinet Y, box
  bottom; the 113 front runs box +2 → +115), then put the bottom hinge in the
  lowest gap. Put the next hinge up ABOVE the fixed shelf over the drawers, not
  in an upper drawer gap (Mark) — BUT
  only while no two hinges end up more than 900 apart. If the drawer bank is
  tall enough that the lowest-gap hinge → above-shelf hinge span is > 900, add
  another hinge in a drawer gap in between. RHK6581
  Bed 2 TC-03: boxes 30.5 / 226.5 / 422.5 / 618.5, hinges [2196, 1570, 870, 187]
  with the fixed shelf top at carcass Y 820.
- **Join the kicks BEFORE locking inner drawers / hinges** (RHK6590, 2026-10-25):
  a locked inner-drawer `y_position` (and every part Y) is in the cabinet frame,
  which includes the kick until the run's kick is joined — then the frame starts
  at the carcass bottom. Unjoined, a drawer at 30.5 sits inside the kick and the
  hinge warnings read 100 off. Fixed shelves: underside = 16.5 + section `size`.
- **Benchtop `height_mm` = the carcass top** (880 for a 900 bench with 20 stone),
  not the finished bench height — the elevation label adds the slab.
- **Top hinge ≥ 50 above the last adj-shelf hole** (Mark, 2026-10-25): the
  top hinge's cup centre sits at least 50 above the TOP of the highest
  adjustable-shelf pin hole (convert: door-bottom frame → carcass Y with the
  door's bottom offset). Not just clear of the plate — 50 clear. If the door is
  too short for that, move the hinge down below the hole run instead and check
  `HINGE_SHELF_HOLE_CLASH` again.
- **Hinges keep ≥ 50 from a fixed shelf** (Mark, 2026-10-23): hinge cup centre
  at least 50 above a fixed shelf's top (or 50 below its underside) where
  possible — "just clear of the plate" (≈ 30) is too close. E.g. shelf top 820 →
  hinge ≥ 870. Still check the shelf-hole error after moving.
- **Bulkhead returns where the end is seen** (Mark, 2026-10-23): when a run has
  a seen end panel (open end, not a wall), turn on that side's bulkhead return
  — `bulkhead.left/right = { on: true, depth: <carcass dz>, joint: 'mitre' }`
  on the BH row. Wall ends stay off.
- **CAD notes about a cabinet = TEXT BOXES inside that cabinet** (Mark,
  RHK6555 2026-10-27): never a point-text line that runs past the cabinet.
  `geom.width` (paper mm) = (cabinet width − 60) / `rooms.annotation_scale`
  (default 20), `at.x` = cabinet left + 30, `style { size: 2.5, align:
  'center' }` — long notes wrap (a 600 rangehood note goes to 3 lines). Keep the
  box off the cabinet's mid-height size label and off drawer fronts it isn't
  about. Short corner tags (PTO) can stay point text, still inside the door.
- **Hanging rails get a CAD note** (Mark, 2026-10-23): every `HANGING_RAIL_OVAL`
  gets a "HANGING RAIL" text note in that wall's elevation just below the rail —
  `room_annotations` row `view: 'elevation'`, `wall_id`, `wall_side: 'face'`,
  `kind: 'text'`, `style: { size: 2.5 }`, `geom.at` = top-left of the text, x
  along the elevation, **y = −(height AFFL)** (y down from the floor). Rail
  bottom AFFL = rail Y + kick; text top ≈ 20 below, x ≈ bay centre − 165.
- **`joinKicks` drops the members' dy by the kick height** — run it on the
  as-placed cabinets; if you nudged a dy to 2400-incl-kick values first, set
  the carcasses back to 2300 afterwards.
- **End panels** (Mark, 2026-10-23): a seen run end with no wall → `TEPF` /
  `BEPF` to the floor. A panel BETWEEN cupboards (e.g. beside an open bay) →
  `TEPK` on the kick. `joinKicks` stops at a TEPK — stretch the first kick
  under it (`updateCabinet('KICK n', { dx })`) so the kick runs wall to wall.
- **Drawers under doors = two cupboards** (Mark, 2026-10-23): a drawer base
  (`D4-SSSL`, rows unlocked for equal drawers) with a `W2D` sitting on it
  (`pos_z` = base top), not one tall carcass. An open bay over drawers = just
  the drawer base + an 18 exposed top (`WUP`, dz = carcass + door + 2,
  `pos_z` = base top) — no cabinet above. Base `dy` includes the kick.
- **Double hanging**: fixed shelf above the top rail only; the bottom rail
  hangs on its own (locked `y_position`), no shelf over it (Mark).
- **Cupboards that hit the ceiling** (Mark, RHK6581 kitchen 2026-10-25): drop
  them 30 and add a 30 `BH` (`front: 'carcase'`) over them — set the room
  `wall_cabinet_top` to ceiling − 30 (auto_h BHs then come out 30), shorten the
  overheads by 30 so their undersides stay put (wall units hang from that line),
  talls / panels / fillers −30. Leave a rangehood canopy alone. Equal-spaced
  fixed shelves move with the height — re-set any `split.at` (shelf top − 3).
- **Apron tops over end panels / curved ends** (Mark, RHK6581 island 2026-10-25):
  the top overhangs **5** past seen end panels and curved ends (curve radius
  +5, same centre), and those panels / curved ends stop **apron − 20 lower**
  (80 apron → 60 down, e.g. 900 → 840) so the apron folds down over them.
  Door faces keep the normal 20 overhang.
- **Void bay = false front + L fixing brackets** (Mark, RHK6581 J10 2026-10-25):
  place a `TEPF` the width of the void, then turn its Applied Panel into the
  false front (orientation `front`, z = `cab.d + t.door + 2 - t.exposed`, flush
  with the doors, to the floor) and add full-height L brackets from internal
  board — two `Nailer / Cleat` strips each, 100 wide × `cab.h` × `t.gable`
  (one `front`, one `side`): side panel → back wall, false front → side panel,
  false front → the cupboard carcass beside it. The side panel beside the void is
  its own `TEPF`. A low "cabinet with a false front to the floor + top" = `B1D`
  with has_toekick off, face zone `false_panel`, no shelf, + an 18 `WUP` top
  (UNDER_PANEL, pos_z = carcass height).
- **Kick face = the fronts' colour** (Mark, 2026-10-25): when the kick face board
  has colours, set `job_toekick_materials` face to the colour material the job's
  door colour links (`door_schedule_materials.material_id`), else every cabinet
  warns COLOUR_NOT_CHOSEN.
- **Bulkhead flush with carcase = flush on the seen side too** (Mark,
  2026-10-23): with `front: 'carcase'`, the BH stops at the carcass edge on a
  seen end — it does NOT run over the end panel. Start it after the panel and
  shorten it by the panel thickness (e.g. 18 TEPF left → BH offset 18, dx
  run − 18). Against a wall it still runs to the wall. With `front: 'doors'`
  it comes out over the panel instead.
- **"No bulkhead, flat panel to top"** (Mark, RHK6581 J01) = a `BH` with
  `front: 'doors'` — flush with the door faces, running over the end panel —
  plus the seen-end return at depth = OA (carcass + door + 2).
- **WUP is always FLAT** (an under panel: part `dx cab.d · dy cab.w · dz
  t.exposed`) — whatever dy you give the cabinet, the part lies horizontal. For
  an upright back panel (e.g. the back of an open seat bay, RHK6581 J01 WC-02)
  set its `cabinet_custom_parts` row `orientation: 'front'`, expressions
  `{dx:'cab.w', dy:'cab.h', dz:'t.exposed'}`, z 0. **Keep `rule_overrides.
  UNDER_PANEL`** — wall-class units ignore `pos_z` and hang from the 2400 line
  (geometry.ts `cabBottomZ`); only UNDER_PANEL / float shelves sit at pos_z.
- **Push-to-open doors get a "PTO" CAD note** (Mark, 2026-10-24) on the
  elevation, at the door's NON-hinged edge (pairs: both doors, at the meeting
  edges): **overhead** → the bottom corner; **base** → the top corner; **tall**
  → 1000 off the floor, moved to the nearest fixed shelf if there is one (no
  fixed shelf → stays at 1000). Text `PTO`, size 2.5, about 75 in from the
  corner. Don't write "PUSH TO OPEN" across the door.
- **Under-bench microwave = one-drawer base + an open box on it** (Mark, RHK6555
  2026-10-27). Drawer base: `B1D` with one `drawer_face` zone, `top_type
  full_top`, no shelf, carcass = bench carcass − box height. Open box: a second
  `B1D` at the same offset/width — `has_face` / `has_toekick` off, `full_top`,
  no shelf, `exposed_interior: true` (all exposed, material from the exposed
  role), `pos_z` = drawer base top incl kick, dy = 380 clear + 2 × t.exposed
  (416 at 18), dz = base carcass + door + 2 (front flush with the drawer front).
- **Filler beside a fridge overhead = a WALL filler at the overhead's height**
  (Mark, RHK6555), not a floor-to-top tall filler: `WEP` → front filler, dy /
  dz = the fridge overhead's.
- **Integrated DW** (Mark, 2026-10-24): door only for now — a `B1D` with
  has_carcass / has_internal / has_toekick off, `pos_z` = kick, dy = carcass − kick,
  face zone `hinge_side: 'bottom'`, `hinges: []` (shows the swing, no hinges) + CAD
  "INTEGRATED DW". Fridge space + its overhead: see **Fridge spaces** in
  `references/cabinet-vision-conventions.md`.
- **Benchtops thicker than 20 = an apron edge** (Mark, 2026-10-24, RHK6581
  island: 80 stone): the slab is still 20 and sits STRAIGHT on the carcass (no
  shadowline); only the edge drops. Run the carcass up to bench top − 20 (e.g.
  920 bench → 900 incl the 100 kick) and drop every top front by the extra:
  cabinet rule `REVT` = (apron − 20) + the normal REVT (80 apron, REVT 4 → 64),
  so the top drawer fronts / doors hang below the apron. A 20 top keeps the
  normal REVT. Applies to most of our benches over 20.
  **With finger pulls** (sharknose) the top gap is FPGAP, not REVT — REVT only
  moves non-grip fronts (UBO panels, false panels). Set room rules
  `{ BY_CLASS: { base: { REVT: (apron − 20) + 4 } } }` AND `finger_gap: (apron −
  20) + FPGAP` (50 apron → 50) on each TOP-ROW grip zone of every base face_grid
  (never class-wide FPGAP — that widens the gaps between drawers too). Tops get
  edge profile `MA50` / `MA80` on the front + seen-end segments (RHK6555).
- **Overheads with a finger grab = bottom overhang + under panel set back 20**
  (Mark, standard, 2026-10-27): `SCRBT` 18 on the overheads, carcass dy =
  overall − 18, then `addUnderPanel([...overheads])` and `updateCabinet(WUP,
  { dz: carcass dz − 20 })` so the panel sits 20 back from the carcass front
  (fingers grab the door backs). "720 high incl under panel" = 702 carcass + 18.
  An overhead filler at a wall = a `WEP` at the filler width with its Applied
  Panel turned into a front filler (`orientation 'front'`, expressions
  `{z: 'cab.d + 2', dx: 'cab.w', dy: 'cab.h', dz: 't.exposed'}`), dy = overall.
- **joinKicks on a mixed-depth run opens an in-app confirm modal** (not a
  window dialog) and the bridge call never returns. Don't join a run whose
  members differ in dz (e.g. a BCNP leg + 575 bases) — leave those kicks
  unjoined, or match the depths first (RHK6555).
- **Kits (WOT / WOT-COMBI) place several members** — draw-plan can't match them
  (it dies "cannot find placed cabinet"). Leave them out of the layout, set
  `rooms.class_dimension_defaults` ({ tall: {dy, dz}, base: {…}, wall: {…} })
  first — the kit sizes from the room's tall height / depth — then
  `placeCabinet({ def: 'WOT-COMBI', … })`. Its TEPKs split the kick run: join
  each side and stretch the kicks under them.
- **A room in a different colour** (RHK6581 J07, 2026-10-24): set it at room
  level — `rooms.door_style_override_id` + `base/wall/tall_door_style_id` (the
  style), `base/wall/tall_door_colour_id` (the Colour Range row), plus
  `room_materials` role `exposed` for base/wall/tall and `room_toekick_materials`
  `face` → the board. 16mm Laminex colours: style "Laminex 16mm Colour", range
  "Laminex Colour 16mm" (add a colour = one `door_schedule_materials` row on the
  "LX Colour 16mm" board), panels are then 16.5 thick. Doors are the 16 BLANK
  (not the 16.5 board), so 600 OA = carcass **582** (582 + 16 + 2); panels follow
  via `t.door` (= the style blank since e7901b9).
- **Desk support panel** at a wall end: `BEPF` 16.5 × (desk underside height),
  dz = carcass dz, at the wall under the desk top; desk top (WUP) runs over it.
  Plus an elevation CAD text "DESK" above the top.
- **Existing cabinets, new doors only**: place the normal cabinet and tick its
  carcass + shelves Removed — `cabinet_instances.part_hide_views` =
  `{ "case_left_side|right_side|bottom|back|full_top": [...], "int_adj_shelf_<n>":
  ["plan","elevation","3d"] }`. Doors, kick and panels are still made. Add a
  boxed CAD note on the elevation saying so.
- **placeCabinet rounds dx to whole mm** (16.5 → 17): reset half-mm widths in the
  DB after placing, then re-resolve.
- **No 1-door tall / side-by-side drawer base in the library**: place `T2D` and
  set `face_grid` to one col (`hinge_side`); for 2 drawers side by side place
  `D2-SL` and set face_grid 1 row × 2 `drawer_face` cols + `internal_grid`
  `{tree:{type:'vsplit', children:[{divider:'single', section:open},{section:open}]}}`.
- **joinKicks across TEPKs**: TEPKs aren't kick-run members, so a TEPK between
  two single cupboards leaves runs of one and joinKicks **pops a window.alert**
  ("needs at least two adjacent…") that hangs puppeteer — always attach
  `page.on('dialog', d => d.dismiss())`. Workaround: slide the cupboards
  together over the panels (`updateCabinet {offset}`), joinKicks, slide them
  back, then stretch the KICK `dx` (it does not refit on its own).
- **Order cabinets in the JSON by the plan's #1..#n numbering** so auto labels
  (BC-01, WC-01, TC-01…) line up with the drawing.

## Spec block (CAD notes)

Each drawn room gets the shop "Spec block" (CAD panel → CAD blocks → Spec
block; layout in z_CAD_tool/ANNOTATION-SPEC.md "CAD blocks + live fields").
**Only spec what's in the room** (Mark, 2026-10-22): leave out any section
or line whose item isn't there, rather than leaving it to show `-` or "By
others". No drawers → drop DRAWERS and the `Runners:` line. No basin → drop
BASIN. No benchtop → drop BENCHTOP. Doors but no drawers → HARDWARE keeps
`Hinges:` only. The block lives in `room_annotations` (view `plan`,
kind `text`); trim its text there or in the editor.

## Layout JSON schema

```json
{
  "projectName": "RHK1234 John Smith",
  "roomName": "Kitchen Test Room",
  "roomHeight": 2400,
  "walls":    [ { "x": 0, "y": 2000, "length": 2000, "angle": 270 } ],
  "cabinets": [ { "def": "B2", "wall": 1, "offset": 0, "dx": 600, "dy": 880 } ]
}
```

Project: use `projectName` (looked up case-insensitively) or `projectId`. Add
`"createProject": true` plus optional `jobNumber`/`clientName` to create a new
project (job defaults cloned from the most recent project).

`wall` is the 1-based index into `walls` (walls are auto-named "Wall N" in draw
order). `offset` = mm from the wall's start to the cabinet's left edge. `dy` is
optional — omit to keep the class default.

Extra fields (full example: `layouts/rhk6456-morris-kitchen.json`):
- Room `roomRules`: room-level construction rule overrides, set before
  placement — e.g. `{ "TOEH": 100 }` for a 100 kick job. `wallCabinetTop`:
  overhead top line from the floor (e.g. 2500 when overheads run to a 2500
  ceiling). Example: `layouts/rhk6581-hive-38howard-kitchen.json`.
- Panel `dz`: the panel defs (BEPF / BEPK / TEPF / TEPK …) size their panel as
  `cab.d + t.door + 2`, so give a panel the SAME dz as the carcase beside it
  (560 carcase → 580 panel, flush with the doors). Do NOT add the front yourself.
  Older defs (`End Panel`, `Tall End Panel`) may still need dz = carcase + front + 2 —
  check the resolved custom part after placing.
- Wall `soffit`: per-wall bulkhead height — overheads hang at
  `wallHeight − soffit` (soffit 595 on a 2445 wall → overhead top line 1850).
- Wall `type: "island"` + `detached: true`: zero-thickness island centreline,
  exempt from the clockwise continuity check. Face-side cabinets land on the
  side toward the room centroid; `flip: true` on a cabinet puts it on the far
  side (script places flipped items first, rotates them +180 in the DB, then
  reloads the page before the face-side pass so overlap logic behaves).
- Cabinet `rules`: per-cabinet construction rule overrides, merged into the
  instance's `rule_overrides` before the re-resolve — e.g.
  `{ "RAIL_ORIENT": "vertical" }` on every sink cabinet.
- Cabinet `set`: `cabinet_instances` columns written before the re-resolve —
  e.g. an open box from `B1D`: `{ has_face: false, has_toekick: false,
  top_type: 'full_top', internal_grid: {...} }` (RHK6550 open shelving).
- Rule `EDGING` merges SHALLOW: a cabinet-level `EDGING` replaces the whole
  set from the construction schedule (gables fall back to all 4 edges). Copy
  the schedule's full EDGING object and change only the part you need.
- Cabinet `dz`: depth override (e.g. 165-deep cupboards). `note`: written to
  the instance's notes (use for plan `# n` + annotations: appliance gaps, PTO,
  false fronts).
- Panel defs (`End Panel`, `Wall End Panel`, `Tall End Panel`) place like
  cabinets; their Applied Panel custom part self-sizes via expressions at
  resolve time. placeCabinet rounds dx to whole mm (819.5 → 820) — expected.

## Troubleshooting

- Supabase creds come from `.env.local`; the anon key passes RLS for reads and
  writes. The `x-dev-automation: 1` header bypasses auth in dev (`proxy.ts`).
- 406/400 console noise from the page during placement is normal (maybeSingle
  probes). A transient "1 Issue" badge right after scripted placement clears on
  reload — don't chase it.
- A cabinet reported `FAIL … faces:0` (parts present, resolver OK) is a
  missed face-zone persist on the first placement. Fix it with
  `__canvasApi.updateCabinet(id, { dy: dy+1 })` and then back to dy, which
  re-resolves and re-persists it. Seen on BC-01 for RHK6581.
- Chrome path override: `CHROME_PATH` env var. Dev port override: `DEV_PORT`.
- To redo a room: delete its `cabinet_instances` rows (parts cascade), then its
  `walls`, then rerun — or delete the room row entirely and rerun.

## Deeper references (next to this file)

- `references/canvas-api-bridge.md` — the `window.__canvasApi` methods and
  their gotchas (stale wall names, React-closure timing).
- `references/headless-automation.md` — the puppeteer recipe behind
  draw-plan.mjs, the RLS check for mysteriously-incomplete headless runs,
  DOM-driving the cabinet modal / Part Editor, and R3F scene inspection.
- `references/ui-driving-tips.md` — driving the visible UI by hand when the
  bridge doesn't cover a flow (incl. the Delete-key confirm() freeze trap).
