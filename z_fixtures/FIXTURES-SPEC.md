# Fixtures & Appliances — Spec

Status: **P1 + P2 committed and on main; viewer modal (b41c0c1); P3 benchtop cutouts built 2026-10-15** — next: P4 cabinet links + schedule. See "RESUME HERE".

Bought-in things placed in a room: ovens, cooktops, dishwashers, fridges,
rangehoods, sinks, taps, decorative items. Catalogue lives in the Settings →
Library group ("Fixtures & Appliances"); placed into a job from the canvas with **F6**.

Wall openings (doors, windows, archways) are a **separate module** that lives
in the Wall tool (F2) — see "Openings (later)" at the bottom.

## Locked decisions (2026-10-14)

1. **One library**, own Settings tab `fixtures_library` ("Fixtures & Appliances",
   group Library). Not part of the Materials library — materials are things cut or
   fitted per cabinet; fixtures are placed room objects with geometry.
2. **Category tabs** inside the library: `appliance`, `sink`, `tap`, `decorative`.
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
| category | text | appliance / sink / tap / decorative |
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
- **P4 — Cabinet links + schedule** — snap sink to sink cabinet, oven into tower
  opening; appliance schedule in reports.

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

## RESUME HERE — open items

- ~~Live visual check of a real uploaded model~~ done 2026-10-15 in the fixture viewer (Miele oven GLB); room 3D view still not eyeballed.
- Right-click context menu for fixtures (today right-click only selects).
- Fixtures don't avoid cabinets when snapping (no collision) — decide with P4.
- Room 3D: sink-in-hole not clearly eyeballed yet (plan + resolver verified).
- Cutout as a CNC op (optimiser / gcode ignore benchtop cutouts entirely today).
- Per-placement cutout edits (FixturePanel only displays the template).
- Elevation: fixtures aren't placeable from elevation; no dimension chains include them.

## Openings (later, separate spec)

Doors, windows and archways belong to a wall: offset along wall, width, height,
sill, type, hinge/swing side. Added from the **Wall tool** (F2) rather than a new
F-key (agreed with the user 2026-10-14). Plan swing symbol, wall gap in elevation + 3D, dimension strings measure to
openings. Layer group `room` (or a new `openings` group).
