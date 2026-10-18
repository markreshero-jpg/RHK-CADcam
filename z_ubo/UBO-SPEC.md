# UBO — under-bench oven cabinet + cabinet contents

Status: **U1–U7 done 2026-10-18 — checked in-app by the user ("tested and works").**
Next work goes under Open below.

A library base cabinet that comes out with an oven already inside it. Built
natively (face grid + interior + carcass options), with the oven as a real
fixture linked to the cabinet — the first use of a general **cabinet contents**
mechanism (later: `BSK` sink + tap, integrated D/W, `WOT` oven tower).

## Locked decisions (user, 2026-10-18)

- **D1 — native cabinet, not object nesting.** No Cabinet Vision-style
  object-in-object tree. A cabinet definition carries *default contents*
  (fixtures); placing it spawns them as ordinary `room_fixtures` linked to the
  new cabinet. Each stays its own object: selectable in plan / elevation / 3D,
  own panel, own display layer.
- **D2 — box.** 600 wide overall (gables included). Base class, standard kick,
  depth / height from the room → job → shop cascade. The oven fascia covers the
  gables (the oven is wider than the clear opening — expected, not a clash).
- **D3 — fronts.** Face grid, three rows, one column:
  fixed panel (`false_panel`) / **open, locked 600 high** / fixed panel.
  The two panels are unlocked, so they share the rest equally.
- **D4 — interior.** One **fixed shelf at the bottom of the oven opening** —
  the oven sits on it. Nothing at the top.
- **D5 — no back.** No back panel at all; a **vertical back rail** instead
  (new carcass option, see U1). Exposed in the sidebar.
- **D6 — the oven lives in the opening.** It anchors to the open face zone, not
  a plan point: centred on the zone across the width, sitting on the zone
  bottom, front flush with the face plane. Resize the cabinet / change the kick
  and it follows.
- **D7 — edit modal shows it.** The cabinet edit modal draws its linked
  fixtures: the real model in the 3D tab, the outline in Elevation / Side /
  Top. Nothing behind the oven is hidden (parts show through as normal).
- **D8 — authoring custom ones later:** set a cabinet up on the canvas, drop
  fixtures into it, then **Save to library** — linked fixtures become the
  definition's contents. (Library-editor Contents section: later, optional.)

Supersedes z_fixtures P4 "**no appliance cabinet codes**" — appliance cabinets
now exist as real library cabinets. Linking by position still works for any
fixture dropped onto a plain cabinet.

## Current code (survey 2026-10-18)

- `resolveFace.ts` — rows: `FaceRowInput { height, height_locked }`, locked
  rows keep `height`, unlocked split the remainder equally, stacked bottom-up
  from `TK + revB` (114-187). **Open zones are skipped** (`continue` at ~214) —
  no rect emitted; row/col offsets are locals.
- `resolveInternal.ts` / `fittings.ts` — `fixed_shelf { y_locked, y_position }`
  (cabinet-space Y). No link between interior and face rows.
- `resolveCase.ts` — `back` is **always** emitted; no back type. `top_type`
  has `double_rail` (horizontal `back_rail`), `RAIL_ORIENT: 'vertical'`.
  Sidebar Top Type select: `CabinetPanel.tsx` ~181-209.
- Fixture links — `room_fixtures.cabinet_id / link_x / link_z / link_rot`;
  `followLinks` (fixtureLinks.ts) patches x / y / rotation only, **never z**;
  follow effect in CanvasClient ~392.
- 3D — `FixtureModel` (src/components/three/FixtureModel.tsx) renders any
  FixtureLook in any r3f canvas (origin back-bottom-left, +X w, +Y up, +Z
  front). `CabinetScene` (Cabinet3DView.tsx ~1259) works in raw cabinet coords
  inside its root group — same frame.
- Elevation outline — `planShapePath(stretchedElevShape(f.elev_shape, f), w, h)`.
- Placement — `placeFromDraft` (CanvasClient ~1009), `handleReplaceCabinet`
  (~1067), `dbPlaceCabinetFromDefinition` (canvasDB ~566). Save to library —
  `saveCabinetToLibrary` (canvasDB ~598).
- Oven: `fixture_catalog` "Generic oven 600" (600 × 600 × 596, under_bench, GLB).

## Phases

**U1 — back options.** New rule `BACK_TYPE: 'panel' | 'none' | 'rail'`
(default `panel`), per-cabinet override via `rule_overrides`, sidebar select
"Back" next to Top Type. `none` → no `back` part. `rail` → no panel, a
`back_rail_v` part: board standing on edge in the back plane, full width
between gables, height `BKRH` (default 100) at the top of the box, joined to
the gables like the top rails. Cut list / nest / drilling / 3D / views pick it
up through the normal case-part path. **Locked 2026-10-18: one rail, at the top
only** (`BKRH` default 100, overridable).

*Built (U1):* rules `BACK_TYPE` ('panel' default) + `BKRH` (100). The rail is
the existing `back_rail` part forced upright, `BKRH` tall — so joints, seams,
drilling, 3D and labels ("Back Top Rail") already handle it; with a
`double_rail` top it's the same single rail. With no back panel the back
thickness counts as 0 for side depth / bottom / top Z, so they run to the back
(`SCRBK` still holds them off). Sidebar "Back" select (cabinet
`rule_overrides.BACK_TYPE`, inherit option) under Top Type; also the job /
room / construction-method rule editors (group "Back"). Test:
`src/lib/resolver/__tests__/backType.test.ts`. **Not applied to shaped
(footprint) cabinets** — `resolveShapedCase` still always emits its backs.

**U2 — open-zone rects + shelf on a face row.**
- `resolveFace` emits `open_zones[]` (row, col, X, Y, DX, DY in cabinet
  space) instead of dropping them. Views keep ignoring them.
- Fixed shelf gets an optional anchor `align_face_row: { row_index, edge:
  'bottom' | 'top' }`: resolver places the shelf so its **top face** = the
  bottom of that row's opening (or its bottom face = the top). Internal
  resolve reads the resolved face rows.

*Also (2026-10-18, user):* with no back panel the interior runs to the box
back — shelves, dividers, inner drawers, drawer slide depth (`caseBackT` in
resolveCase.ts). A back rail on edge tapes its lower ('bottom') edge by
default; an explicit `EDGING.back_rail` wins.

*Built (U2):* `ResolvedCabinet.open_zones` (`ResolvedOpenZone` row / col / X
/ Y / DX / DY — the face-grid cell; primary box front only, empty for shaped
cabinets; not persisted, so canvas consumers must re-resolve or read the
live resolve). `FixedShelfFitting.align_face_row` handled in fittings.ts
`alignToFaceRows` before `positionFittings`; row edge from the open cell, else
a front in that row. Missing row → `SHELF_FACE_ROW_MISSING`. **No editor UI
yet** for align_face_row — set in data (UBO seed); add to the interior editor
when custom appliance cabinets need it. Test: `openZones.test.ts`.

**U3 — UBO library definition.** Seed `UBO` (copied from `B2D` for
construction / materials / kick): 600 wide, face grid per D3, interior per D4,
`BACK_TYPE: 'rail'`, contents per U4. Subcategory: Appliances (create if
missing). Migration in `z_ubo/`.

*Built (U3):* `z_ubo/migration_u3_ubo_library.sql`, applied — new
`cabinet_subcategories` row "Appliances"; `UBO` definition (base, 600 ×
cascade height / depth, B2D construction / materials / kick, front_rail top,
`rule_overrides.BACK_TYPE = 'rail'` — copied onto the instance at placement).
Fixed shelf via `align_face_row { row_index: 1, edge: 'bottom' }`. No contents
yet (oven arrives in U4). Test: `uboCabinet.test.ts` (exact seeded data; 900 →
two ~71 panels at default rules; 820 keeps the 600 opening).

**U4 — contents data model + spawning.**
- `cabinet_definitions.contents jsonb` — `[{ fixture_catalog_id, anchor }]`,
  `anchor = { kind: 'zone', row_index, col_index }` or
  `{ kind: 'point', link_x, link_z, link_rot, z }` (z above the cabinet floor).
- `room_fixtures.link_zone jsonb null` — `{ row_index, col_index }`.
- Zone-anchored pose: x centred on the open zone, y (underside) = zone bottom
  = shelf top, front of the fixture flush with the face plane. Recomputed on
  every resolve; `followLinks` extended to patch **z** for zone links.
- Spawn on `placeFromDraft`, `handleReplaceCabinet`, `dbPlaceCabinetFromDefinition`.
- Contents fixtures are **deleted with their cabinet** (and re-spawned by
  Replace); a fixture dropped onto a plain cabinet keeps today's behaviour
  (unlinks on delete).

*Built (U4):* migration `z_ubo/migration_u4_contents.sql` (applied):
`cabinet_definitions.contents jsonb not null default '[]'`,
`room_fixtures.link_zone jsonb` (`{ row_index, col_index, y }`, y = cell
bottom above the cabinet bottom); UBO contents = "Generic oven 600" in row 1
(looked up by name).
- `src/lib/cabinetContents.ts` — `ContentItem` / `LinkZone` types,
  `zoneSeat` (centre across the cell, front on the face plane = max front
  Z + DZ, link_rot facing the room), `zoneFollow` (re-seat from a live resolve
  with `open_zones`; else the stored seat; z = cabinet bottom + link_zone.y),
  `definitionContents` parser. Test `src/lib/__tests__/cabinetContents.test.ts`.
- `app/canvas/[roomId]/contentsDB.ts` `dbSpawnDefinitionContents` — after the
  cabinet's first resolve; inserts linked `room_fixtures` from the catalog
  rows. Called from `placeFromDraft` (incl. drag-drop) and
  `handleReplaceCabinet` (CanvasClient `spawnContents`).
- Follow effect (CanvasClient): `zoneFollow` before `followLinks`; orphaned
  zone fixtures are **deleted** (DB + state), others just unlink. Undo / redo
  sync fixtures from the snapshot, so placement undo removes the oven and
  delete undo restores it.
- Moving / stretching a seated fixture by hand clears `link_zone`
  (`linkFields`) — it then stays where it's put, position-linked.
- **Not yet:** headless `dbPlaceCabinetFromDefinition` (canvasDB) doesn't
  spawn contents; the fixture panel's height edit is overridden while seated.

**U5 — edit modal shows contents.** `CabinetScene` gets a `fixtures` prop and
renders `FixtureModel` at the cabinet-local pose (3D tab + room 3D unchanged
since room fixtures render separately — room view passes none). Elevation /
Side / Top draw the fixture outline. Clicking it selects it: small panel with
Swap model (catalog picker, same kind), Remove, Open in fixture editor.

*Built (U5):* `fixtureLocalBox` (cabinetContents.ts) — linked fixture → box in
the cabinet frame + yaw vs facing out. CanvasClient passes every fixture with
`cabinet_id` = the cabinet (seated or point-linked, e.g. a sink) to
CabinetEditModal `fixtures`. Ortho views (`ResolvedElevation / Top / Side`)
draw `CabinetFixturesOverlay` (traced elev_shape when facing out, else a dashed
box + name); `Cabinet3DView` renders `FixtureModel` next to CabinetScene (not
inside it, so the room 3D doesn't draw it twice). Click → `CabinetFixtureCard`:
Swap for (catalogue items of the same category + kind; a seated item keeps its
front on the face plane), Remove, Select on canvas (closes the modal, selects
the fixture → its normal FixturePanel = the "fixture editor").

**U6 — Save to library carries contents.** `saveCabinetToLibrary` snapshots
the cabinet's linked fixtures into `contents` (zone anchor when the fixture
sits in an open zone, else point). Library list shows a contents count.

*Built (U6):* `contentsFromFixtures` (cabinetContents.ts): seated → zone anchor;
position-linked (e.g. a sink on a base) → point anchor (link_* + height above
the cabinet bottom); fixtures without a catalog_id skipped.
`saveCabinetToLibrary` (canvasDB) loads the cabinet's linked fixtures + its
room / wall for the bottom height. It now also carries the cabinet's own
carcass choices in `rule_overrides` — **only** `BACK_TYPE`, `BKRH`,
`RAIL_ORIENT` (it used to save `{}`; other cabinet overrides such as a kick
join's `TOEH` stay behind). Library list: "+N fixture(s)" badge next to the
code; Duplicate copies contents (select *).

**U7 — check in-app** (place UBO, resize, change kick, join kicks, swap oven,
cut list has the shelf + back rail and no back).

## BSK — sink cabinet (2026-10-18)

`z_ubo/migration_bsk_library.sql`, applied. `BSK` (Appliances): B2D at 900
wide, pair of doors, no shelf. Contents = two **point** anchors: Abi Zalo
Double Bowl U/M sink (centre x 450, z 310) + Abi Pull-out Sink Mixer (hole
centred behind the sink, 50 off the wall → footprint centre 481.5 / 156.75).
- Point anchors may carry `yaw` (turn vs facing out, `facingOutRot`) instead
  of a raw `link_rot` — seeded data uses yaw so it's right on any wall side.
- Spawn: **benchtop-mount** contents sit on the benchtop under them less their
  drop (no top yet → default bench height), like a hand-dropped sink; the
  anchor `z` is ignored for them. They cut the top as usual. Drawing the
  benchtop after placing doesn't re-seat them (same as any sink today, P3).
- Fixed the Zalo catalogue row (was under_bench / drop 0 → benchtop / 205).

## Open

- Small leftovers: headless `dbPlaceCabinetFromDefinition` doesn't spawn
  contents; fixture-panel height edits are overridden while seated; no
  interior-editor UI for `align_face_row`; shaped (footprint) cabinets ignore
  `BACK_TYPE` and report no `open_zones`.
- Later: `BSK` (sink + tap, point anchors), integrated D/W, `WOT` (two zones).
