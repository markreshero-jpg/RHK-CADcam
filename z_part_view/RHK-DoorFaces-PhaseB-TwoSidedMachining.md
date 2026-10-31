# Phase B — Two-Sided Machining (6th face nesting)

**Status:** NOT STARTED. Design/spec only. Phase A (editor + tagging) is done — see
"Phase A recap" below and `memory/door-face-front-back.md`. Method locked with Mark
2026-10-31 (§0) — it follows Cabinet Vision's 6th face nesting.

**Goal:** any part with machining on **both faces** gets it — not just doors. Each
sheet that needs it runs as **two programs with a whole-sheet flip between**.

---

## 0. Locked method (Mark, 2026-10-31 — supersedes §3b's pause/separator idea)

- **Two separate programs per sheet**, not one program with an `M00`:
  - **Program A (first):** the drilling on the **back** of the panels — hinge cups,
    drawer front fixings, handle holes etc. — **plus clean reference edges**: a
    trim along the sheet's **outside long edge** and along the **end nearest X0**.
  - **Flip** the whole sheet; push the two trimmed edges into **X0 / Y0**.
  - **Program Z (second):** the **face machining** — shaker routes, VJ grooves etc.
    — **and the part outlines** (cut-out). Program Z is datumed off the trimmed
    edges, so its coordinates are measured from true edges, not the raw sheet.
- **Scope:** every part with machining on both faces (doors, gables, drawer backs,
  panels …). Parts whose work is all on one face just appear in the one program.
- A sheet with no A-face work anywhere gets **only program Z** (= today's single
  program) — no trims, no flip.
- **Flip over the long edge** (confirmed): the far long edge comes to Y0, the X0
  end stays at X0. Program Z = program-A frame mirrored in Y about the sheet's
  trimmed width.
- **Face A = the back face of the material** for every part (doors: hinge side),
  so after the flip the face is up for program Z.
- **Trim cut = 5mm** off each of the two edges, with the material's **outline
  (part cut-out) tool**.
- Answers §5 Q1 (two programs), Q2 (flip axis) and Q4 (registration).

### Build order (agreed 2026-10-31)
1. **Face routes first** — shaker, VJ etc. machined in today's single program. The
   route/groove emitter already exists (`routes.ts`, 6816dd7, reads `route`/`groove`
   part_operations), but **door profile ops never become part_operations**: they
   are evaluated in `resolveFace.ts` (`evaluateProfileOps`) for drawing only. So
   step 1 = write door-profile ops as `face_front` route/groove part_operations and
   check they cut right on a test door.
2. **Then 6th face** — split A/Z programs, trims, flip mirror.

### Still to decide
- File naming for the pair (e.g. `…_01A.anc` / `…_01Z.anc`) and labels: which program
  prints labels (Z, since it cuts the parts out).

---

## 1. Convention (locked with the user)

- A front panel resolves **DX = width, DY = height, DZ = thickness** (Phase 1 flip).
- **Decorative front = +Z** (faces the room). **Back = −Z** (faces the carcass) —
  hinge cups, drawer-front fixings, system holes drill here.
- On the machine: **front face DOWN on the bed, back face UP** — so back-face ops
  are the "material-up" pass that exists today.
- Editor: front toward you by default; `face_back` ops shown on the back; a
  Front/Back toggle; back view mirrors L↔R. (Phase A — done.)
- **Generated ops:** hinge/fixing/system → `face_back`; door-style profiles →
  `face_front`. Hand ops default to the active editor face.

---

## 2. Current-state findings (from the pipeline map — verify before coding)

The G-code pipeline today is **single-face, drill-only**:

1. **One program per sheet, one machined (up) face.** No two-sided / flip /
   multi-setup / reverse-pass scaffolding anywhere.
2. **Only `operation_type = 'drill'` reaches G-code.** `sheetDrills.ts:54` filters
   to drills. Routing/groove/pocket `part_operations` are **never emitted** — the
   only routing is the auto-generated part *perimeter* (`gcode.ts routePerimeter`).
   → Decorative-front ops are usually grooves/profiles/pockets, so **a routing
   emit path must be built from scratch** — this is the biggest single piece.
3. **`plane_kind` never leaves the Part Editor.** The optimiser/G-code path reads
   the drill's cabinet-space `axis`, not `plane_kind`. Front/back intent is dropped
   before the post-processor.
4. **`output_face` survives only as far as `drills.ts:104`**, where it picks which
   edgeband edge to deduct (`POS_FACES` = {right, top, front}). It is stripped from
   `SheetDrill` and never reaches `gcode.ts`. It is NOT a physical-side selector.
5. **`upSign` convention:** `zoneFrame` sets `upSign:'+'` (`partFootprint.ts:59`) —
   "doors nest cup-side/back UP", so back-face bores drill as-is and front-face
   bores get X-mirrored in `projectToFrame` (`partFootprint.ts:115`). This encodes
   the single-side, back-up assumption you'll reconcile for the front pass.

### Pipeline chain (files, in order)
`nest.ts` (placements) → `Stage6Gcode.tsx` (orchestrator: loads machine profile
`cnc_machine_profiles`, gang-drill config `cnc_drill_blocks`/`_spindles`, calls
`loadSheetDrills` then `generateSheetGcode` once per sheet) → `sheetDrills.ts`
(`loadResolvedDrillOps` reads `part_operations`; runs `syncSeamDrillOperations` +
`syncMasterSlaves` first) → `drills.ts` (`buildSheetDrills`/`toSheet`: part-local →
sheet coords, eb-deduct, repeat expand) → **`gcode.ts` = the post-processor**
(`generateSheetGcode` emits header → drilling [generic `sequenceDrills` OR Anderson
gang `emitGangDrilling` M88/M89] → circular pockets → per-part `routePerimeter` →
footer; `postFromProfile` maps a `cnc_machine_profiles` row → `PostProfile`).

### Post/machine config
- `PostProfile` + `DEFAULT_POST` + `postFromProfile` in `gcode.ts` (~27-139, 781-859):
  datum (`origin_corner`, `x/y_axis_direction`, `z_axis_up`), `mirror_y`/`sign_y`
  (whole-sheet output-datum reflection for material-face-down — gang block only
  today, `gcode.ts:481`), tool-change/spindle/coolant/work-offset codes,
  `drill_cycle_code`/`drill_return_code`, gang fields, `header_template`/`footer_template`.
- UI: `app/settings/CncMachinesClient.tsx` (`cnc_machine_profiles`),
  `CncToolsClient.tsx` (`cnc_tools`), `DrillLibraryClient.tsx` (`cnc_drills`),
  `DrillBlockSetup.tsx` (`cnc_drill_blocks` + `_spindles`).
- Saved output: `nest_jobs` / `nest_sheets.gcode` / `nest_placements` (only Stage 6 writes).

---

## 3. Design

Two-sided output = **partition each part's ops by face**, keep the back pass exactly
as today, and add a **front pass** that is the same sheet mirrored about one axis
(the physical flip) with its own setup block / program.

### 3a. Thread the face tag end-to-end (prerequisite)
- `sheetDrills.ts:53` select: also pull `plane_kind` (already pulls `output_face`).
- `drills.ts` `DrillOpRaw` (~12-29): add `plane_kind?: string | null`.
- `drills.ts` `buildSheetDrills` → `SheetDrill` (`gcode.ts:141-147`): add
  `face: 'front' | 'back'` (derive: `plane_kind === 'face_front' ? 'front' : 'back'`;
  keep default 'back' so untagged/hinge ops stay on the back pass).

### 3b. Partition + second setup in `generateSheetGcode`
- Split drills (and routes, once §3c exists) into `back[]` and `front[]`.
- Emit the **back pass** first (current behaviour, unchanged).
- If `front[]` non-empty, emit a **flip separator** (`M00`/`M01` pause, or a second
  program per the machine profile) + the **front pass** with a whole-sheet mirror.
- **Mirror axis:** the physical flip is about the sheet's **vertical (Y) axis** if
  the operator flips left-to-right, or **X** if end-over-end — MUST be a machine
  setting. Reuse the existing datum-mirror machinery (`mapX`/`mapY` `gcode.ts:249-254`
  and the `mirror_y`/`sign_y` `ty()` at `:481`) rather than new math.
- New `PostProfile` / `cnc_machine_profiles` fields likely needed:
  `two_sided_enabled`, `flip_axis` ('x'|'y'), `flip_separator_code`
  (default `M00`), optional `front_work_offset`, and whether front is a
  separate program file.

### 3c. Routing / groove / pocket emit path — BUILT (6816dd7, routes.ts); door-profile ops not fed in yet (§0 build order)
Today only drills + auto-perimeter are emitted. Front-face profiles/grooves need a
real route emitter:
- Read `operation_type IN ('route','groove')` in `sheetDrills.ts` (currently drill-only).
- Project their geometry to sheet coords (extend `buildSheetDrills`, or a sibling
  `buildSheetRoutes`): grooves = line + width + depth; pockets/routes = rect/offset
  area (see `opFaceGlyph` in `partOpGlyphs.tsx` for the geometry vocabulary).
- Emit in `gcode.ts`: reuse `routePerimeter` / `emitCircularPockets` patterns; needs
  tool selection (router bit) per op — resolve via existing tool libraries
  (`resolveDrillTools.ts` / `cnc_tools`, material `cnc_tool_id`).
- Multi-pass depth (respect `max_depth_per_pass` from `cnc_tools`).

### 3d. `upSign` / mirror reconciliation
- Back pass: keep `zoneFrame` `upSign:'+'` (back-up) — unchanged, correct today.
- Front pass: the part is flipped, so the front-face coordinate that was X-mirrored
  by `projectToFrame` must be **un-mirrored** (or the whole-sheet flip must cancel
  it). Work this out on paper with one known hole before trusting output — a front
  hole authored at part-local `pos_x` must land at the physically correct sheet X
  after flip. This is the highest-risk correctness item.

---

## 4. File-by-file work list

| File | Change |
|---|---|
| `src/lib/optimiser/sheetDrills.ts` | select `plane_kind`; read route/groove ops (§3c) |
| `src/lib/optimiser/drills.ts` | `DrillOpRaw.plane_kind`; `SheetDrill.face`; `buildSheetRoutes` |
| `src/lib/optimiser/gcode.ts` | `SheetDrill.face`; partition passes; flip separator + mirrored front pass; route/groove emitter; `PostProfile` flip fields; `postFromProfile` mapping |
| `app/settings/CncMachinesClient.tsx` | new machine fields: two-sided enable, flip axis, separator, front work offset |
| `app/projects/[projectId]/optimiser/Stage6Gcode.tsx` | pass new profile fields; possibly emit 2 programs / label passes; preview both |
| Simulator (`gcodeParser.ts` / viewer) | show both setups if a 2-program/flip preview is wanted |
| DB migration | `cnc_machine_profiles` new columns |

---

## 5. Open questions / decisions before starting

1. ~~One program or two?~~ **Two programs, A then Z (§0).**
2. **Flip axis** — assumed over the long axis (§0), to confirm with Mark.
3. **Front-face tooling:** which router bit / tool number for front profiles &
   grooves — per material, per op, or a fixed "front profile" tool?
4. ~~Registration~~ **Program A trims the outside long edge + X0 end; flipped
   sheet pushed into X0/Y0 (§0).**
5. **Do front ops need onion-skin/tabs** like the perimeter, or full-depth?
6. **Scope of route emit:** only grooves/pockets, or also arbitrary drawn paths
   (Phase 3 "stored outline" territory)?

---

## 6. Verification plan (cannot be done in the sandbox)

1. Author one front-face groove + one back-face hinge on a test door; optimise.
2. Confirm back pass identical to a control door with no front ops.
3. Confirm front pass appears after the flip separator, mirrored correctly — check
   the one known hole/groove lands on the physically correct spot after flip.
4. Dry-run on the machine (air cut) before real stock.
5. Regression: a door with only back ops must produce byte-identical G-code to today.

---

## Phase A recap (done)

Editor + tagging, all `tsc`-clean, browser-unverified:
- `plane_kind` drives which physical face an op renders on: `face_front` → `+n`
  (decorative), `face_back` → `−n` (machined). (`partOpGlyphs.tsx` `opFaceSide` +
  OpMarkersSVG / OpMarkersDepthSVG / OpMarkers3D / buildOpSubtractions.)
- Front/Back **toggle** in the editor toolbar (shown for `dxIsWidth` front panels);
  off-face ops **ghosted**; **back view mirrors L↔R** (`PartOrthoView` `hmir`,
  `PartEditor` `face` state).
- New hand ops default to the active face (`usePartOps.addOp(kind, planeKind)`).
- Generated hinge cups + drawer-front fixings tagged `plane_kind: 'face_back'`
  (`seamDrillSync.ts`). `output_face` untouched (still drives eb-deduct only).
- The properties-panel plane dropdown already offered Front/Back/Edge; the
  "Pick in view" interior click now sets the currently-viewed face.
