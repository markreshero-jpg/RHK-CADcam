# Cross section (elevation) — spec

A live side-on section through the current elevation wall. While it's on, the
section fills the elevation canvas and the elevation moves to the right-hand
column, where a vertical cut line slides smoothly from one end of the wall to the
other; the section shows the true shape of every part the line passes through.

Not to be confused with:
- the elevation toolbar's **Section** button (a *depth* slider that peels the fronts back), and
- the **Section** canvas tab (a plan-drawn cut that draws whole cabinets as boxes).
This feature is called **Cross section** in the UI.

## Locked decisions (Mark, 2026-10-25)

| # | Decision |
|---|----------|
| D1 | ~~Small pane in the right-hand column~~ → **swapped (Mark, 2026-10-25):** the section fills the elevation canvas; the elevation (with the cut line) shows in the right-hand column (stacked above any open panel, one column — never a second column). |
| D2 | Everything is cut: carcase parts, kicks, fronts, internals, drawer boxes, added parts (end panels / fillers), bulkheads, benchtops, the wall itself; then fixtures and hardware (phase X4). |
| D3 | Only the cut parts are drawn (no "beyond" geometry). Floor + ceiling lines for reference. |
| D4 | Flip button: default looks along the elevation's +x (from the left end: wall on the left, room to the right); flipped looks back the other way. |
| D5 | No dimensions yet — added later (X6). |
| D6 | The cut line moves smoothly (no snapping). Position readout = mm from the elevation's left end, also typeable. |
| D7 | Save option: save named cuts per wall for the shop drawings / elevation report (X5). |
| D8 | (Mark, 2026-10-25) The section keeps the elevation's colours and layers: it gates through the **elevation** layer view and the elevation part-hide filter, and paints each part the way the elevation does (part palette by part key, layer colour override, line-drawing mode, style, weight). |

## How it works

- The section is a slice of the **3D model**, gated through the **elevation** layer
  view (`elevLayers` + `filterHiddenMap(…, 'elevation')`, D8), so the layer set and
  colours the user is looking at drive it. Items map via `casePartItem` /
  `kickPartItem` / `faceZoneItem` / `internalPartItem` / `customPartItem`;
  benchtops → `benchtops`, wall → `walls`. Each solid also carries its palette key
  (`SectionSolid.key` = part_key / part_type / face_type) for the elevation colour.
  No new layer items for the live view (the cut line is a tool overlay, like the
  measure tool). X5 registers a `section_marks` elevation item for printed cut markers.
- Geometry: `buildPartSolids` (same solids as the 3D view and cabinet sheets),
  placed in the world exactly like `Room3DScene` `CabinetMesh`; benchtops from the
  same slab / leg / apron geometry as `BenchtopMesh` (`src/lib/benchtopSolids.ts`).
- Fixtures + hardware (X4): rather than rebuild hinges / handles / runners / bins
  / uploaded fixture models, `CrossSectionMeshes.tsx` mounts the room 3D's own
  `CabinetMesh` (gated by the elevation layers) and the fixture models in a 2 px
  off-screen R3F canvas with `frameloop="never"` (doors / drawers stay closed),
  and reads the visible meshes back every 600 ms (only rebuilding when a mesh or
  matrix changed, e.g. a GLB finished loading) as world triangles. Tags:
  `userData.partId` on `PickableHardware` and `Part` (hw_hinge_ → hinges,
  hw_handle_ → handles, hw_bin_ → bins, slide_ → drawer_runners, int_slide_ →
  inner_drawer_runners; board parts are skipped — they're sliced as solids), and
  each cabinet / fixture is wrapped in a group carrying its id. Triangles are cut
  by `sliceTriangles` and chained by `chainPaths`: closed loops are filled, open
  chains (single-skin model surfaces, e.g. a sink bowl) are drawn as lines.
  Colours follow the elevation: hinges / handles / runners / bins by their item
  colour, fixtures by the fixture item colour (sky blue default, 25 % fill).
- Slicer: `src/lib/crossSection.ts` — planar-face slice (half-open sign rule so a
  vertex on the plane counts once), segments chained into loops, holes via
  even-odd fill. Section frame: u = depth off the elevation face (`elevationFrame`
  n), v = height.
- Everything in the room is sliced (a cut near a corner runs along the return
  benchtop / cabinets). The fit box is fixed per wall (wall thickness → deepest
  thing on the wall + margin) so the drawing doesn't jump while sliding. Only the
  current wall is drawn as a wall (a return wall the line runs along isn't).
- Section view: fills the canvas (the viewBox follows the canvas aspect, so the
  floor runs edge to edge); scroll = zoom about the cursor, drag = pan,
  double-click = fit (kept per wall + side + look). Hover a shape → cabinet ·
  layer item; click → selects the cabinet. The elevation is portalled into a 340 px
  slot at the top of the right-hand column (its snap toolbar hidden there; its fit
  margin shrinks in a small pane). On toggle, and on every wall change, the line
  starts at the wall's middle.
- Files: `src/lib/crossSection.ts` (slicer), `src/lib/crossSectionRoom.ts` (room
  solids), `src/lib/cabPlacement3d.ts` + `src/lib/benchtopSolids.ts` (shared with
  Room3DScene), `app/canvas/[roomId]/CrossSectionView.tsx`, cut line + toggle in
  `ElevationSVG.tsx`, state in `CanvasClient.tsx` (`crossCut`, `xsecSlot`).
  `CrossSectionMeshes.tsx` (X4). Headless checks: `z_plan_automation/verify-cross-section.mjs`,
  `z_plan_automation/sweep-cross-section.mjs` (steps the At box, logs hardware / fixtures cut).

## Phases

| Phase | What | Status |
|---|---|---|
| X1 | Slicer lib + tests | done 2026-10-25 |
| X2 | Elevation cut line (drag, typed position) + section: cabinets, added parts, wall (with openings), floor/ceiling, flip, zoom/pan | built 2026-10-25, checked headless |
| X2a | Swap: section fills the canvas, elevation in the right column; elevation layers + colours (D1, D8) | built 2026-10-25, checked headless (Line drawing + Design sets); Mark's in-app check pending |
| X3 | Benchtops (slab, waterfall legs, aprons) | built 2026-10-25 (slab checked headless; legs / aprons unchecked) |
| X4 | Fixtures (GLB meshes) + hardware (handles, runners, hinges, bins) | built 2026-10-25, checked headless (RHK6581 Laundry J03: dryer, sink, hinges; RHK6539 kitchen: handles, runners); Mark's in-app check pending |
| X5 | Save cuts per wall → shop drawings / elevation report (+ `section_marks` layer item) | not started |
| X6 | Dimensions | not started |
| X7 | Tutorial (Basics ▸ Room ▸ Cross section through a wall) | built 2026-10-25, updated for the swap; unreviewed |

## Return cabinet sections (R) — the elevation shows the return walls' cabinets, cut

Asked by Mark 2026-10-26 (RHK6581 J05: bases on Wall 1, talls on Wall 2 running
into the corner — "can Wall 1 show Wall 2's cabinets on end?").

| # | Decision |
|---|----------|
| R-D1 | Cut, not a silhouette: the return walls' cabinets are sliced by a vertical plane parallel to this elevation's face, at the depth of this wall's cabinets (Mark: "if wall 1's cabinets are 600 deep, draw the returns cut at 600"). Depth = deepest cabinet on this wall + side, skipping end panels / fillers / scribes (< 100 wide), kick runs, bulkheads, floating shelves, back panels; 600 when the wall has none. |
| R-D2 | ~~Everything the cut passes through, hardware included~~ → **changed (Mark, 2026-10-26, R1a):** a simple outline of each part, everything *up to* the cut — every part between the wall face and the cut depth, projected flat (parts facing the viewer at true shape, benchtops as their hull), no fill. A part starting at or past the cut isn't drawn, so a cut on a joint shows the cabinet behind it whole. No hardware (hinges, runners, handles, bins) — no hidden 3D scene. Fixtures not drawn. Line colour = the elevation's part colour (`src/lib/sectionPaint.ts`). |
| R-D3 | On by default, screen and prints: layer item `return_sections` (Room group, elevation only), then each part's own item — except Gables, Tops / rails + Bottoms, which always draw solid here (Mark, 2026-10-26, tops + bottoms asked; gables added with them: sets like Line Drawing Print / Kicks hide them and Face elevation ghosts them for face-on views, but side-on they're needed). Prints: black ink. |
| R-D4 | Return walls = the walls joined to this wall's ends (same 50 mm rule as the return-wall slabs, islands never). Only loops within the wall's length draw (a return's back-side cabinets sit outside). Not clickable. |

How it works: `src/lib/returnSection.ts` (return walls, cut depth, plane = the
cross-section plane with d/n swapped so u = elevation x, `returnProjectionLoops`),
`app/canvas/[roomId]/ReturnSectionSVG.tsx` (`<g data-role="return-sections">`, plus
`useReturnSectionData`: the return cabinets' part overrides, loaded once per view /
report). Drawn in `ElevationSVG` (after the
benchtops) and `ElevationPrintSVG` (`returnSec` prop, from `ElevationPrintReport` /
`ShopDrawingsReport`). Headless checks: `z_plan_automation/verify-return-sections.mjs`
(ROOM_ID, WALL) and `verify-return-sections-print.mjs` (ROOM_ID).

| Phase | What | Status |
|---|---|---|
| R1 | Cut at the wall's cabinet depth, screen + elevation report + shop drawings, layer item, tutorial (Basics ▸ Room ▸ See the corner cabinets side-on) | built 2026-10-26, checked headless (RHK6581 J05 Wall 1: TC-07 cut at 580 — open unit, so shelves / top / bottom / back / kick; RHK6539 kitchen Wall 3: Wall 2's wall cabinet with door + hinges, screen and print); Mark's in-app check pending |
| R1a | Outlines up to the cut, no hardware (R-D2 change) | built 2026-10-26, checked headless (J05 Wall 1: TC-06 filler + TC-07 gable / shelves / kick; test kitchen Wall 3 + its print); Mark's in-app check pending |
| R2 | Ideas, not asked: a per-wall cut-depth override; dims; hidden-line removal (parts behind others still show through) | — |
