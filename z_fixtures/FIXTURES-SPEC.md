# Fixtures & Appliances — Spec

Status: **P1–P9 built and on main (2026-10-18). User has checked P4 + several follow-ups live; P5 doors & windows, P6 categories, P7 stretching, P8 true shapes, P9 wall position not yet confirmed in-app.** Open items in "RESUME HERE".

Bought-in things placed in a room: ovens, cooktops, dishwashers, fridges,
rangehoods, sinks, taps, decorative items. Catalogue lives in the Settings →
Library group ("Fixtures & Appliances"); placed into a job from the canvas with **F6**.

Wall openings (doors, windows, archways) are a fixtures sub-category (`opening`,
decided 2026-10-18) — see "Openings (P5)" at the bottom.

## Locked decisions (2026-10-14)

1. **One library**, own Settings tab `fixtures_library` ("Fixtures & Appliances",
   group Library). Not part of the Materials library — materials are things cut or
   fitted per cabinet; fixtures are placed room objects with geometry.
2. **Category tabs** inside the library: `appliance`, `sink`, `tap`, `decorative`,
   `opening` (added 2026-10-18 — doors/windows/archways, see P5).
   Free-text `kind` under a category (Oven, Cooktop, Dishwasher…) for grouping.
3. **3D models**: GLB / glTF-binary / STL / OBJ, same loader stack as drawer slides.
   The loader is shared (`src/components/three/ModelAsset.tsx`); slides keep their
   own anchor convention. GLB recommended (keeps colours); STL/OBJ take the item colour.
   No model → a plain box at the catalogue size.
4. **Model fitting**: the model's bounding box is auto-aligned to the item box
   (centred left-right and front-back, bottom on the floor of the box) after
   `model_scale` + `model_rot_x` (90° steps, fixes Z-up exports) + `model_rot_y`.
   "Fit to size" button computes the scale from the bbox; "Size from model" does
   the reverse (sets W/D/H from a correctly-sized export). Offsets X/Y/Z nudge after.
   Item-box convention: origin = **back-bottom-left** corner, +X width, +Y up,
   **+Z toward the front** (glTF's forward, so most GLB exports face the room
   without turning — matches the cabinet 3D local frame). Maths: `src/lib/fixtureFit.ts`.
5. **Storage**: public bucket `fixture-models` (public read, admin write — same as
   the slide/hinge model buckets).
6. **Placed fixtures copy the catalogue row into the job** (name, sizes, model,
   colour) — jobs stay as-built ([[job version pinning]]); a placed fixture keeps
   working if the catalogue row is deleted (`catalog_id` → null).
7. **Mount** decides default height: `floor` (0), `under_bench` (0), `benchtop`
   (sits on the benchtop: default z = shop bench height), `wall` (default z from the
   catalogue `mount_height`). Per-placement `z` can always be edited.
8. **Layers**: new layer group `fixtures` with items `fixture_appliances`,
   `fixture_sinks`, `fixture_taps`, `fixture_decorative` (all views, on). Per the
   display-layers rule.
9. **Access**: `fixture_catalog` = `library_read` + `admin_write`;
   `room_fixtures` = `job_access` via `can_access_room(room_id)`.

## Data model

`fixture_catalog` (library)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| category | text | appliance / sink / tap / decorative / opening (P5) |
| kind | text null | Oven, Cooktop, Dishwasher… |
| name | text | |
| brand, model_no | text null | |
| width, depth, height | numeric | mm, outside size |
| mount | text | floor / under_bench / benchtop / wall |
| mount_height | numeric null | wall items: underside height from floor |
| colour | text null | box + STL/OBJ colour |
| model_url, model_format | text null | glb / stl / obj |
| model_scale | numeric 1 | |
| model_rot_x, model_rot_y | numeric 0 | degrees |
| model_off_x/y/z | numeric 0 | mm nudge after auto-fit |
| notes | text null | |
| active | bool true | |
| sort_order | int 0 | |

`room_fixtures` (job)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| room_id | uuid → rooms, cascade | |
| catalog_id | uuid → fixture_catalog, set null | |
| snapshot fields | | category, kind, name, width, depth, height, mount, colour, model_* (copied at placement) |
| x, y | numeric | plan position (mm) of the back-left corner (same as cabinet pos_x/pos_y) |
| rotation | numeric | degrees, plan |
| z | numeric | underside height from floor |
| wall_id | uuid null | wall it was snapped to (elevation membership) |
| label | text null | |

## Phases

- **P1 — Library** ✅ built 2026-10-14 (uncommitted). Migration
  `fixtures_p1_catalog_and_room_fixtures` (both tables, policies, `fixture-models`
  bucket added to the shared `models_admin_*` storage policies). Files:
  `src/components/three/ModelAsset.tsx` (shared loader — SlideModel now uses it),
  `src/components/three/FixtureModel.tsx` (fitted model / box fallback / error
  boundary), `src/lib/fixtureFit.ts` (+ test), `src/lib/modelFormat.ts`,
  `app/library/fixtures/` (Settings tab `fixtures_library` + standalone
  `/library/fixtures`), types `FixtureCatalogItem` / `RoomFixture` in types.ts.
  Model files are never deleted (placed fixtures point at them).
- **P2 — Placement** ✅ built 2026-10-14 (committed in c7d1633) — F6 picker, place/snap to wall, move/rotate/delete,
  plan + elevation + 3D rendering, layer items, object tree.
- **P3 — Benchtop cutouts** ✅ built 2026-10-15 — sink/cooktop cutout template on the
  catalogue row cuts the benchtop under it; benchtop-mount height from the real top.
- **P4 — Cabinet links + schedule** ✅ built 2026-10-18 — fixtures dropped over a cabinet
  link to it and follow it (no centring); overlap warning; appliance schedule report.
  See "P4 — what was built".
- **P6 — Categories with icons** ✅ built 2026-10-18 — see "P6 / P7" below.
- **P7 — Stretching like cabinets** ✅ built 2026-10-18 — see "P6 / P7" below.
- **P5 — Openings** ✅ built 2026-10-18 — doors / windows / sliding doors / openings as the
  `opening` category, sitting in a wall (see "Openings (P5)" at the bottom).

## P2 — what was built (2026-10-14)

- **Geometry** `src/lib/fixtureGeometry.ts` (+ test): axes from rotation
  (a = (cos r, sin r) width, n = (−sin r, cos r) front), corners, centre,
  `snapFixture` (back onto the nearest wall face within 600 mm on the cursor's side,
  centred on the cursor, clamped to the wall; none in range → free), `fixtureOnFace`
  (elevation membership: faces the viewer within ~45°, back within 1200 mm of the
  face), `defaultFixtureZ` (benchtop mount = 900 placeholder, wall = catalogue
  mount_height), `fixtureLayer(category)`.
- **Canvas** `useFixtureInteraction.ts`: carry state (place / move), ghost, insert /
  update / rotateBy / remove, all through captureSnapshot. Mode `place_fixture`;
  Selected `{ type: 'fixture' }`. Keys: **F6** sidebar section, **R** turn 90° while
  carrying free, **Shift** = don't snap, **M** = move selected (double-click opens the viewer),
  **Del** delete, **Esc** stop. Placing stays armed for repeat drops.
- **Views**: `FixturesPlan` (CanvasSVG `fixturesLayer` slot; symbols: appliance box +
  cross, cooktop burners, sink bowl, tap circle, decorative ellipse; heavy front edge),
  `FixturesElevation` (ElevationSVG), `Fixtures3D` (Room3DScene `fx` prop; hides
  with its wall). `FixturePanel` (right dock): label, per-placement size, off-floor,
  centre X/Y, rotation, Move, Turn 90°.
- **Undo**: `useCanvasHistory` takes optional fixtures (Snapshot.fixtures optional so
  old drag snapshots still work).
- **Layers**: group `fixtures` — `fixture_appliances`, `fixture_sinks`,
  `fixture_taps`, `fixture_decorative`, `fixture_labels` (all on by default; no
  shop layer-set rows changed).
- Object tree: room-level "Fixtures" section (read-only details). Room delete dialog
  counts fixtures (cascade already deletes them).
- Verified in the dev app (Kitchen Test Room, scripted events — Chrome tab was in the
  background, so no 3D screenshot yet): place snaps to wall + elevation position,
  turn, undo, delete + undo-delete (DB restored), move free with R. Test row removed.

## Fixture viewer (2026-10-15)

Double-click a placed fixture in plan (or **View 3D / elevations** in its panel) →
`FixtureViewModal`: PreviewCanvas with 3D + Front / Back / Left / Right / Top ortho
views (Back/Left added to PartViewer as opt-in `views`/`viewLabels`), measure tool,
"Size box" outline toggle, and the same FixturePanel fields beside it. Checked in-app
with the Miele oven GLB.

## P3 — what was built (2026-10-15)

- **Columns** (migration `fixtures_p3_cutout_template`, applied live; copy in
  `z_fixtures/migration_p3_cutout_template.sql`) on both `fixture_catalog` and
  `room_fixtures` (placed copy, like the rest of FixtureBody): `cutout_shape`
  (null | rect | round), `cutout_w`, `cutout_d`, `cutout_radius`, `cutout_off_x`
  (+ right), `cutout_off_y` (+ forward), `bench_drop`.
- **Locked: cutouts are derived, never stored.** `withFixtureCutouts(bt, fixtures)`
  (fixtureGeometry.ts) appends a fixture's cutout polygon to the benchtop whose
  outline holds the cutout centre. Used by CanvasClient `benchtopsDrawn` (plan
  CanvasSVG + Room3DScene — render only, state/saves untouched) and by
  `loadBenchtopInput` (resolver now loads room_fixtures). So the hole follows the
  sink when it moves; `benchtop.cutout_polygons` stays the hand-drawn ones only.
  Supply / reports read stored `meta.cutouts` → they update on the next Resolve.
- Resolver round test was "≥16 points" — misread rounded-corner rects. Now
  `isRound`: vertices + edge midpoints all within 3% of one radius.
- **Height**: placing / moving a benchtop-mount fixture sets
  z = top of the benchtop under its centre − `bench_drop` (CanvasClient passes
  `benchTopAt` → `btInfo(b).topZ`). No benchtop there → 900 placeholder − drop.
  Not re-run when the benchtop height changes later (edit Off floor or move it).
- Library editor: "Drops below top" (benchtop mount) + "Benchtop cutout" section
  (None / Rectangle / Round, size, corner radius, offsets). FixturePanel shows it.
- Test item: "Test sink 600 single bowl (inset)" — generated GLB (600×500 rim,
  450×380×190 bowl), cutout 580×480 R15, drop 190. Placed in the "Kichen" test
  room; plan hole + resolver meta (580×480, not round) checked in-app.

## P4 — what was built (2026-10-18)

Locked with the user 2026-10-18:
- **No auto-centring.** Sinks are off-centre on their cabinet about half the time, so a
  fixture stays exactly where it's dropped. It only *remembers* its spot on the cabinet.
- **Link by position, no appliance cabinet codes.** Real jobs draw a plain B2 for the
  sink and leave oven voids / D/W gaps as space between panels.
- **Ovens in an open zone of a tower: later** (needs the resolver to expose open-zone
  rectangles — `resolveFace` skips open zones today).
- **Overlaps warn, never block.**
- Future, separate module (no spec yet): **cabinet groups / assemblies** — save e.g. a
  WOT (oven tower) as a group of cabinets in the library, drop it as one, then edit each
  cabinet on its own. The integrated D/W assembly on the roadmap fits the same idea.

Built:
- **Columns** on `room_fixtures` (migration `fixtures_p4_cabinet_links`, applied live;
  copy in `z_fixtures/migration_p4_cabinet_links.sql`): `cabinet_id` (→ cabinet_instances,
  on delete set null), `link_x` / `link_z` (footprint centre in the cabinet's frame: x from
  its left along the width, z from its back) and `link_rot` (turn vs the cabinet frame).
- **Geometry** `src/lib/fixtureLinks.ts` (+ test): `cabinetPlans` (frame per cabinet from
  `cabinetPlanFrame`), `linkFor` (benchtop / under-bench → base+tall cabinets, wall → wall
  cabinets, floor → never; kick assemblies skipped; centre-in-footprint),
  `linkedPose`, `followLinks`, `fixtureClashes` (plan overlap with 1 mm tolerance + height
  overlap via `cabBottomZ`, now exported from elevationSnap; benchtop-mount items and the
  fixture's own cabinet ignored).
- **Linking**: place / move / turn / panel centre edits all re-link to the cabinet under the
  new pose (`linkAt` in useFixtureInteraction; `update` re-links any x / y / rotation patch
  without an explicit link). Panel shows "On BC3 · follows it" + **Unlink**.
- **Follow**: an effect in CanvasClient watches the cabinets (covers drag, resize, panels,
  elevation, wall drag, undo) — state follows live, DB write debounced 400 ms, flushed on
  unmount. No own undo snapshot (the cabinet change's snapshot holds the old fixtures).
  Deleted cabinet → link cleared locally (DB does it via FK).
- **Overlap warning**: red outline in plan (`FixturesPlan` `clashIds`) + red note in the
  panel naming the cabinets.
- **Appliance schedule** report (ReportsModal, room + job scope;
  `ApplianceScheduleReport.tsx`): appliances, sinks, taps (no decorative) — item, name,
  brand + model no. (looked up from the catalogue row via `catalog_id`; blank if that row
  was deleted), W×D×H, location (linked cabinet, else wall, else free-standing). Print = HTML.
- Dev bridge: `getState().fixtures` + `updateFixture` (canvas-api-bridge.md).

## P6 / P7 — what was built (2026-10-18)

**P6 — categories.** User asked for finer categories (sinks, taps, ovens, fridges,
windows, doors…) with an icon, and an icon picker for new ones. Locked with the user:
**Lucide icons** (lucide-react added; a curated ~60-icon set in
`src/components/FixtureIcon.tsx`, imported by name so the bundle stays small — the full
`icons` map / `lucide-react/dynamic` were avoided); **starter list** Ovens, Cooktops,
Rangehoods, Dishwashers, Fridges, Microwaves, Laundry, Sinks, Taps, Windows, Doors,
Decorative.
- Table `fixture_groups` (name, icon, `category` = behaviour type, sort_order; library_read +
  admin_write) + `fixture_catalog.group_id` (on delete set null → "Other"). Migration
  `fixtures_p6_groups` (copy `z_fixtures/migration_p6_groups.sql`) seeded the 12 and sorted
  the existing rows by kind.
- The old fixed `category` stays as the **type** that drives behaviour (mount defaults,
  cutouts, wall hosting, layers, links). A category's type can only change while it's empty;
  an item can move to another category of the same type.
- Library: tabs = categories with icon + count, "Other" tab when anything's unsorted,
  "+ Category", ✎ on the active one → GroupEditor (name, icon grid, type, move left/right,
  delete → items go to Other). F6 picker lists by category with the icon.
- Placed fixtures don't store the group (schedule still groups by type).

**P7 — stretching.** "Same stretching behaviour as cabinets" for every fixture incl.
windows / appliances: click an edge handle, the edge follows the cursor, click sets it;
Esc cancels; one undo step.
- Plan (`FixturesPlan` StretchHandles): left / right (blue, width), front (purple, depth;
  not openings). Elevation (`FixturesElevation` ElevHandles): left / right, top (height),
  bottom = sill for openings (head stays). Elevation rounds to 10 like cabinets.
- `fixtureGeometry.ts`: `stretchPatch`, `stretchBounds` (wall ends + nearest obstacle in the
  depth band), `elevationFrame`, `elevLeftSide`; `fixtureLinks.ts` `stretchObstacles`
  (openings → other openings in the wall; benchtop items → none; else cabinets + free-standing
  fixtures at an overlapping height, not the linked cabinet). Test `fixtureStretch.test.ts`.
- Hook: `startStretch` (snapshot) / `stretchMove` (state only, re-links live so a linked
  sink doesn't snap back) / `commitStretch` (one DB write) / `cancelStretch`. Plan commits on
  the canvas click (like `commitResize`); elevation on pointer-up (like `confirmResize`).

## RESUME HERE — open items

- 2026-10-18 (user): **library rows from supplied GLBs** — Abi Ohelu 380 + Seba 550 U/M sinks,
  Abi pull-out tap, gas + induction cooktops 600 / 900 (7 rows). Models served from the app's
  `public/fixture-models/` (model_url `/fixture-models/<file>.glb`) — no bucket write access
  from the session; re-uploading in the library editor moves one into the bucket. Sizes from
  the model bbox (metres → scale 1000); all benchtop-mount: sinks drop 205 (rim at the top
  surface), cutout = rim − 15 each side R10 (as Zalo); cooktops drop 45 gas / 55 induction,
  cutout = body size; tap 35 round hole under its base. Plan / elev shapes traced headless
  (vitest + GLTFLoader.parse). Not checked in-app.

- 2026-10-18 (user: "lets work through the known gaps"):
  - **Brand / model no. copied onto placed fixtures** — `room_fixtures.brand` + `model_no`
    (migration `fixtures_brand_snapshot`, applied live + backfilled; copy in
    `z_fixtures/migration_brand_snapshot.sql`), in BODY_KEYS, editable per placement in the
    panel (job copy only). Schedule reads the job copy, library row as fallback.
  - **Link button** — an unlinked fixture sitting on a cabinet (placed before P4, or Unlinked)
    shows "Sits on B3 · not linked" + **Link** in the panel. No automatic re-link on load (it
    would undo a deliberate Unlink).
  - **Slide-clear uses the fixture's own off-wall band** — `bandOccupancy(…, depth, near)`;
    a sink pulled forward no longer slides away from something only behind it.
  - **Overlap warning in elevation + 3D** — `fixtureClashIds` → FixturesElevation (red
    outline) and Fixtures3D (red box outline when not selected).
  - **Door swing warning** — `doorSwingPolygon` (fixtureGeometry, test `doorSwing.test.ts`):
    quarter disc the leaf sweeps (in / out, hinge side). `fixtureClashes` checks hinged doors
    against every cabinet in it (base or wall — the leaf is full height); door goes red in plan,
    panel says "Door swing hits B3". Sliding doors / windows / archways aren't checked.
  - **Elevation PDF sill + opening height** at each right jamb (same as the canvas).
  - **Door & Window Schedule** report (`OpeningScheduleReport.tsx`, test `openingSchedule.test.ts`):
    Mark (label, else D1 / S1 / W1 / O1 per room), type, name, W × H, sill, head, wall,
    hinge + swing for hinged doors. Room or job scope, print like the appliance schedule.
  - **Right-click menu in elevation** (View 3D / elevations, Move, Turn 90°, Delete) — same
    menu as plan, via ElevationSVG `onFixtureContextMenu`. Not in 3D.
  - **Appliances in the dimension rows** — `fixtureChainSpans` (fixtureGeometry, test
    `fixtureChainSpans.test.ts`): wall-snapped solid fixtures (not openings / benchtop / linked)
    within 300 of a face. Floor items → base row (plan) / floor chain (elevation); wall-mount
    (rangehood) → wall-cabinet row / overhead chain. Canvas plan + elevation and both PDFs; gated
    by the fixture's layer. Depth dims still from cabinets only.
  - **Benchtop cutouts cut on the CNC** (gap 1; Mark: "we do cutouts sometimes … we dont need
    build up rails cut around it but if one lands inside a cut then it should move across").
    Resolver: the worktop + subtop panels carry the piece's cutouts as `holes` (part frame,
    like `outline`; new column `benchtop_resolved_parts.holes` jsonb — migration
    `benchtop_resolved_parts_holes`, applied live, copy `z_fixtures/migration_benchtop_holes.sql`).
    Build-up strips / rails are never cut: `crossMemberPositions` (construction.ts) moves a cross
    member whose band lands in a cutout to the nearer side, CUTOUT_CLEARANCE 10 mm clear, still
    between the end members; no room either side, or landing on another member → left out.
    Perimeter rails don't move. Optimiser: `cut_holes` on the benchtop OptiPart (op frame);
    `shapes.placedHoles` places them like the outline (EB-shifted blank + rotation); Stage 4 / 5
    sheets draw them; Stage 6 passes `GcodeInput.holes`. G-code: each hole is an inside profile
    (`routePerimeter(…, inside)`; `toolPathLoop(…, inside)` offsets inward) cut just before
    its part's perimeter, both onion-skin phases; climb = CW in a hole. Ramp entry zig-zags
    along the start edge (a straight ramp would run out of the hole into the part) and lifts
    straight out. A hole the bit can't get round → WARN comment, not cut. Tests
    `cutoutHoles.test.ts` (resolver) + `holeGcode.test.ts` (optimiser). **Existing tops need
    Resolve pressed once** to get holes. Simulator 3D carve doesn't cut the hole out (the toolpath
    shows). Same routing bit as the perimeter.

- 2026-10-18 (user): **P10 Cut benchtop tick box + per-placement cutout override.** Column
  `cut_benchtop` (bool, default true) on fixture_catalog + room_fixtures (migration
  `fixtures_p10_cut_benchtop`, applied live; copy in `z_fixtures/migration_p10_cut_benchtop.sql`),
  copied on placement (BODY_KEYS). Unticked → `benchtopFixtureCutouts` skips it (plan, 3D,
  resolver). FixturePanel: tick box + editable shape / size / radius / offsets on the placed copy
  (overrides the library for this job only). Library editor: tick box = default for new
  placements. Not checked in-app. No "reset to library" button yet.

- 2026-10-18 (user): **elevation true shape** — `elev_shape` (same format, v down from the top;
  migration `fixtures_p8_elev_shape`), traced with the plan shape (`traceShapes`): front view =
  nearest surface toward +Z per cell, outline + step-back contours (oven door / glass / knobs).
  FixturesElevation draws it instead of the box (+ inner panel); mirrored if the item's width runs
  against the elevation. Library shows both previews. Backfilled the three models. Very thin
  parts (< grid cell, e.g. a 1 mm sink flange) barely show.

- 2026-10-18 (user): **P9 wall reference** — FixturePanel "Wall position" block like CabinetPanel for
  wall-backed items (not openings): From left end / From right end (its own left / right, looking
  at its front), Clear left / Clear right (from the clearance dims), **Off wall** (back → wall face,
  pull a sink forward). `fixtureWallRef` (fixtureGeometry, + test). Moving along the same wall keeps
  the off-wall distance; linked items re-link so they keep following their cabinet.

- 2026-10-18 (user): **P8 true plan shape** — plan draws the model's top view instead of the box +
  symbol. `fixturePlanShape.ts` (+ test): fitted triangles → top-down height map (2–6 mm grid) →
  marching squares for the outline + a contour midway between neighbouring height plateaus
  (≥ 6 mm apart: sink bowls, drains, burners), shared stretches de-duplicated, Douglas–Peucker,
  stored normalised (`plan_shape` jsonb on fixture_catalog + room_fixtures, migration
  `fixtures_p8_plan_shape`) so stretching scales it. Library editor traces it automatically
  (`fixturePlanShapeLoad.ts`) when the model / fit / size changes or an item without one is
  opened, shows a preview + Re-trace, and copies it to placed fixtures with the same model.
  Existing three models backfilled 2026-10-18. Openings and model-less items keep their symbols.

- 2026-10-18 (user): **clearance dims on the selected fixture** (cyan, dashed, value chip).
  Plan (`fixtureClearances` + FixturesPlan `ClearanceDims`): left / right / front / back to the
  nearest stretch obstacle (cabinets + solid fixtures at its height) or wall; doors / windows to
  the wall ends + other openings. Elevation (FixturesElevation `ElevClearance`): left / right to
  boxes at its height or the wall ends, below to the box under it or the floor, above to the box
  over it or the ceiling. Shown in Select and while stretching; < 1 mm (touching) hidden.

- **Decision changed 2026-10-18 (user: "appliances aren't being recognised by the cabinets and
  overlapping is occurring")** — replaces P4's "overlaps warn, never block":
  - Cabinets treat appliances as obstacles: `fixtureOccupancy` (cabinetObstacles.ts) is in
    CanvasClient `wfOcc`, so plan place / move / stretch and elevation (via `waterfallOcc`) all
    stop at them. Obstacle = `solidFixtures`: not an opening, not benchtop-mount, not linked.
  - Appliances avoid cabinets: on place / move a wall-snapped non-benchtop item that doesn't
    link slides to the nearest free gap (`slideClear` + `bandOccupancy` over cabinets + other
    solid fixtures; `clearOf` in useFixtureInteraction). Dropped over a cabinet it links to
    (under-bench oven / wall rangehood) it links instead. The red clash warning stays for
    anything that still overlaps (e.g. after a stretch / resize elsewhere).

- 2026-10-18 (user): **move like a cabinet** — selected fixture shows the white centre
  crosshair (plan + elevation); click it → follows the cursor (same carry as Move / M), next
  click drops. The carried one is hidden in elevation while its ghost shows.

- 2026-10-18 (user): **sidebar preview of the armed fixture** (`FixturePreview3D`, pinned at the
  sidebar bottom like `CabinetPreview3D`) — fitted model / box / opening frame + size, brand.

- 2026-10-18 (user): picking a fixture (F6) or Move while in **elevation** no longer jumps to
  plan — it's carried in that elevation (cursor → plan point 1 mm off the face, so it snaps to
  this wall / side; dashed ghost at the landing spot; drop on pointer-up). And placing is
  **one drop, then Select with it selected** (like cabinets) — no longer stays armed.

- **P6 / P7 not checked in the app.** Check: library tabs + icons, + Category / ✎ editor,
  F6 picker headings; stretch a dishwasher between two cabinets (stops at them), a window
  in plan + its sill in elevation, a linked sink (stays linked).

- ~~P4 in-app check~~ done by the user 2026-10-18 ("works well").
- **P5 not yet checked in the app** (no AUTOMATION_* creds for headless). Check: F6 →
  Doors & windows → drop a window and a door on a wall (gap in plan, swing arc); panel
  Sill / From start / Hinge / Swings; elevation hole on both faces + dims; 3D hole with
  frame + glass / leaf; drag the wall / change its thickness → openings follow;
  Reports → Plan View + Elevation Views PDFs.
- P5 gaps: ~~elevation print draws the width row only~~ sill + height added 2026-10-18; the
  elevation canvas width row sits above the overhead chain — check it isn't clipped;
  ~~openings aren't in any schedule~~ Door & Window Schedule 2026-10-18;
  ~~a door's swing doesn't warn when it hits a cabinet~~ done 2026-10-18.
- Dishwasher: "Generic dishwasher 600 freestanding" catalogue row added 2026-10-18;
  GLB `z_fixtures/models/Dishwasher/generic-dishwasher-600-freestanding.glb` (generator
  `build_dishwasher.mjs`, any W × D × H) to be uploaded by the user in the library.
- ~~Elevation / 3D don't show the overlap warning~~ done 2026-10-18.
- ~~Existing placed fixtures aren't linked until moved once~~ — Link button 2026-10-18.

- ~~Live visual check of a real uploaded model~~ done 2026-10-15 in the fixture viewer (Miele oven GLB); room 3D view still not eyeballed.
- ~~Right-click context menu~~ done 2026-10-15 in plan: View 3D / elevations, Move, Turn 90°, Delete (undoable); elevation 2026-10-18. Not in 3D.
- ~~Fixtures don't avoid cabinets~~ P4 said warn only; changed 2026-10-18 — they now block / slide (see top).
- Room 3D: sink-in-hole not clearly eyeballed yet (plan + resolver verified).
- ~~Cutout as a CNC op~~ done 2026-10-18 (see the gaps block). Not checked on the machine.
- ~~Per-placement cutout edits~~ done in P10.
- ~~Elevation: fixtures aren't placeable from elevation~~ done 2026-10-18. ~~Dimension chains don't include appliances~~ done 2026-10-18.

## Openings (P5 — built 2026-10-18)

**Decision changed 2026-10-18 (user):** doors, windows and archways are a
**fixtures sub-category** (`opening`), not a separate Wall-tool module. This
replaces the 2026-10-14 "Wall tool (F2)" decision.

Built as proposed below (user: "lets go p5"). Kinds: Window / Door / Sliding door /
Opening. Starter library rows: Window 1200×1200 + 1800×1200 (sill 900), Door 820×2040,
Sliding door 2400×2100, Opening 900×2100.

- **DB** (migration `fixtures_p5_openings`, applied live; copy in
  `z_fixtures/migration_p5_openings.sql`): `fixture_catalog` category check gains
  `opening`; `room_fixtures.hinge_side` (left/right, from inside the room) + `swing`
  (in/out).
- **Geometry** (`fixtureGeometry.ts`, test `openings.test.ts`): `snapOpening` — in the
  nearest real wall (cursor in the body or ≤ 600 either side; islands skipped), back on the
  outer face, depth = thickness, rotation from the inward normal; never free (Shift
  ignored). `openingSpans` (per wall, inside-face t, merged), `openingOnWall` (both
  faces, back mirrored, + hinge jamb x), `refitOpenings` (re-seat after the wall moves /
  changes thickness — run in CanvasClient's follow effect). `geometry.ts`: `wallPieces`
  (footprint split around spans, mitred ends kept) + `wallSpanQuad`.
- **Plan**: CanvasSVG `wallOpenings` → wall drawn as pieces; `OpeningSymbol`
  (FixturesPlan) — window glazing lines, door leaf + dashed swing arc, sliding panels,
  opening dashed head; no box / front edge / label. Moving one closes its old gap.
- **Elevation**: `OpeningHoles` cut after the wall face (under cabinets), frame +
  `OpeningElev` symbol on top; both faces. 3D: `WallMesh` `holes` → prisms around each
  hole; `OpeningModel` (frame, glass / leaf) when there's no GLB.
- **Dims**: layer item `dim_openings` (plan + elevation, on). Plan: a row to the jambs
  between the kick row and the overall (canvas + Plan View PDF). Elevation canvas: width
  row above the wall + sill / opening height at each right jamb. Elevation PDF: width row.
- **Panel**: Width / Height, Sill, From start (left jamb from the wall start), Hinge
  Left/Right + Swings Into room/Out for doors; no Turn / free X-Y. Openings never link to
  cabinets and are left out of the overlap check.

Original proposal:
- Catalogue: `category = 'opening'`, `kind` = Window / Door / Archway / Servery…;
  width + height + default sill (`mount = wall`, `mount_height` = sill; doors/archways 0).
  Optional 3D model (frame/sash) like any fixture; no model → frame outline only.
- Placement: F6 picker like other fixtures, but an opening **must** snap to a wall
  (`wall_id` required); depth follows the wall thickness, not the catalogue.
- Per placement: offset along wall, sill height, hinge side + swing (doors).
- Drawing: wall gap + swing/glazing symbol in plan; hole through the wall in
  elevation + 3D; dimension strings can measure to opening edges.
- Layers: new item `fixture_openings` in the `fixtures` group.
- Needs `'opening'` added to `FixtureCategory` (types.ts), the category tabs, and
  the category → layer map in `fixtureGeometry.ts`.
