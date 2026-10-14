# Fixtures & Appliances — Spec

Status: **P1 (library) built 2026-10-14, uncommitted** — next: P2 placement. See "RESUME HERE".

Bought-in things placed in a room: ovens, cooktops, dishwashers, fridges,
rangehoods, sinks, taps, decorative items. Catalogue lives in the Settings →
Library group ("Fixtures & Appliances"); placed into a job from the canvas with **F5**.

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
- **P2 — Placement** — F5 picker, place/snap to wall, move/rotate/delete,
  plan + elevation + 3D rendering, layer items, object tree.
- **P3 — Benchtop cutouts** — sink/cooktop cutout template on the catalogue row
  becomes a cutout operation on the benchtop under it.
- **P4 — Cabinet links + schedule** — snap sink to sink cabinet, oven into tower
  opening; appliance schedule in reports.

## RESUME HERE — P2 placement notes (from the canvas map, 2026-10-14)

- Load: add a 4th query to `app/canvas/[roomId]/page.tsx` (room_fixtures by room_id) + prop.
- State/persistence: model on `useBenchtopInteraction.ts` (direct supabase, optimistic
  update, captureSnapshot) — no resolver. Add `fixtures` to `useCanvasHistory` Snapshot
  + diff-sync, and to ProjectCard room duplicate/delete counts.
- F5: key handler next to F2–F4 in CanvasClient; picker = new section in
  `CanvasSidebar.tsx` (like the Cabinet section, rows arm a placement).
- Snap: reuse `nearestWall` + `wallInwardNormal` + `wallAnchorPoint` (geometry.ts);
  fixtures may also sit free (no wall) — store free `rotation`.
- Plan: CanvasSVG loop like benchtops (`layers.show(...)` gate); elevation: project
  like BenchtopElevation (`wallFrame`/`alongOf`) so free-standing items show on any
  wall they face; 3D: Room3DScene, group at (x, floorY+z, y), rotY from rotation,
  render `FixtureModel`.
- Layers: add group `fixtures` + items to registry.ts; object tree: room-level node.

## Openings (later, separate spec)

Doors, windows and archways belong to a wall: offset along wall, width, height,
sill, type, hinge/swing side. Added from the **Wall tool** (F2) rather than a new
F-key (agreed with the user 2026-10-14). Plan swing symbol, wall gap in elevation + 3D, dimension strings measure to
openings. Layer group `room` (or a new `openings` group).
