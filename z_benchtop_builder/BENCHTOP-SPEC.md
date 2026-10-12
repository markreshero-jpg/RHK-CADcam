# Benchtop Builder — Spec & Phase Tracker

> **Purpose**: the living spec for the benchtop module. Survives chat wipes —
> update status lines and decisions in the same change as the code.
> Original design doc: `CADcam_Benchtop_Builder_Spec.docx` (v1.0, May 2025).
> Where this file and the .docx disagree, **this file wins**.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → Phases 0–5 done (2026-10-12). Next: pick from Deferred
> (splashbacks, CNC profiles, auto panel splits) or Phase 5 follow-ups (R-f).
> Phase 4 rules Q-a…Q-h are Claude's defaults; its 3 open questions are locked.

---

## Where it stood (audit 2026-10-11)

Built from the .docx in May 2026 (commits 0089e85, b895f0c):

- Schema: `benchtop_instances` (polygon / edge_tags / join_types / arc_segments /
  cutout_polygons), `benchtop_build_methods`, `benchtop_schedules` +
  `benchtop_schedule_rows`, `benchtop_materials`, `job_/room_benchtop_materials`
  overrides, `benchtop_resolved_parts`. Job/room/benchtop columns for method + schedule.
- Library page `/library/benchtop-methods` (CRUD + wizard with SVG illustrations).
- Canvas: F4 menu, polygon / rect / L / U draw, arcs, edge exposed/wall toggle,
  vertex butt/mitre toggle, cutout rect/circle, mirror/offset/rotate, layer-gated render.
- Resolver `src/lib/benchtop-resolver/` + Reports modal reads `benchtop_resolved_parts`.

Defects found:

1. **Never resolved on real data** — 0 build methods in the DB → `loadBenchtopInput`
   returns null. 4 duplicate unreferenced "20mm Stone" schedules, none default.
2. **Resolver is bounding-box based** — an L/U top comes out as one bbox-sized
   panel; rails wrong; `join_types` captured but never read; cutouts ignored.
3. **Worktop thickness** only reads `benchtop_materials` (surface) — a board
   worktop (built-up) always falls back to 33.
4. **No cut-list / optimiser hook** — only the Reports modal reads resolved parts.
5. Canvas drawing tool is too primitive (Mark, 2026-10-11) — replace with Shape Editor.
6. No edge-profile library — only a free-text `benchtop_materials.edge_profile`.

---

## Locked decisions (Mark, 2026-10-11)

1. **Build methods in use**: 33mm built-up (board), laminate/postform, 20mm stone.
2. **Construction is a per-method setting, all options available** — the build
   method editor offers every construction style; the shop picks per method:
   - `buildup_flat`  — board worktop + strips laid flat underneath (perimeter +
     cross members), edge shows top+strip (e.g. 16.5 + 16.5 = 33).
   - `buildup_vertical` — board worktop + rails on edge underneath; rail height sets build-up.
   - `solid` — single board cut to shape and edged, no build-up parts.
   - `outsourced` — see 3.
3. **Stone and laminate/postform are measure + report only** (`outsourced`).
   The software outputs shape, dimensions, edge profiles (lineal m), waterfalls
   and cutouts for ordering/quoting. **No cut-list parts** — except in-house
   extras the method enables (substrate, scribe strip).
4. **Drawing tool = reuse the Shape Editor** (`src/components/ShapeEditor`).
   Rough-out on the plan stays (rect/L/U quick draw); double-click a benchtop
   opens the full Shape Editor with walls + cabinets as reference outlines.
   One component, shared improvements.
5. **Edge profiles = a DB library, benchtop-only** (not shared with cabinet
   parts this round). Add / edit / delete in the library UI. Starter sets:
   stone, board, postform (see Phase 1).
6. **Edge profiles drive**: display, **reports/quoting** (lineal m per profile),
   and **part generation** (profiles can spawn parts — mitred apron → apron
   strip, waterfall → end panel). They do **not** drive CNC machining this round.
7. **Waterfall ends are IN scope** for "finished". Modelled as an edge profile
   with `generates = 'waterfall'` on an end edge.

## Proposals → all LOCKED (Mark, 2026-10-11)

- **P-a Geometry storage** — **LOCKED**: new `benchtop_instances.segments jsonb` in the
  Shape Editor segment format (mm, room frame), each segment's `edge` carrying
  `{ wall: bool, profile_id: uuid|null }`. `polygon` + `arc_segments` become
  derived (kept written for back-compat with plan render / snapping until
  every reader moves). Existing rows migrated rect → 4 line segments.
- **P-b Joins = cut lines, not vertex flags** — **LOCKED (Mark, 2026-10-11)**. A join is a straight line across
  the top (butt or mitre); joins split the shape into **pieces**; the resolver
  makes one worktop part per piece (bbox + shape). Replaces `join_types`.
  Default join type comes from the build method.
- **P-c Benchtop / waterfall height** — **LOCKED, REVISED (Mark, 2026-10-11)**: the top
  SITS ON the base cabinets. The job's `class_dimension_defaults.base.dy` (e.g. 900)
  is the cabinet height = the top's UNDERSIDE; the surface is base.dy + top
  thickness (900 + 33 = 933). Waterfall leg = base.dy (floor to underside),
  mitred to the top. (Room overrides of base.dy follow the normal dims cascade.)
  Superseded wording: "base.dy is the finished height including the top".
- **P-d Profiles on wall edges** — **LOCKED**: not allowed; a wall edge has no profile
  (UI drops profile_id when an edge becomes wall).

---

## Phases

### Phase 0 — Audit, spec, cleanup, seed  `[x]` (2026-10-11)
- [x] Audit (above) + this spec.
- [x] Deleted the 3 unreferenced duplicate "20mm Stone" schedules (kept `da288276…`).
- [x] Seeded (live DB, data only — no DDL): build methods **33mm Built-Up**
      (default; strips 90 wide, butt corners), **Laminate / Postform**,
      **20mm Stone**; schedule **33mm Built-Up — Whiteboard 16.5** (default;
      worktop + rails + cross members → Whiteboard 16.5mm).
- [x] Resolver fix: worktop thickness from the board when the schedule row
      names a board material (`resolver.ts` worktop_panel).
- [x] Verified: Kitchen "Benchtop 1" (1073×560 rect) resolves → 5 part rows in
      `benchtop_resolved_parts`.
- Known wrong output (fixed by Phase 2/4): end strips = depth − 2×thickness
  (527) — that's the vertical-rail rule; flat strips should be
  depth − 2×strip width (380). Cross members likewise.
- ~~Known design gap: schedule and method chosen independently~~ — fixed in
  Phase 2 (method default schedule).

### Phase 1 — Edge profile library  `[x]` (2026-10-11)
- [x] Table `benchtop_edge_profiles` (`id, name, code, category
  stone|board|postform, description, generates none|apron|waterfall,
  apron_drop_mm, radius_mm, preview_svg, sort_order, active, timestamps`) +
  `benchtop_build_methods.default_edge_profile_id` (FK, on delete set null).
  Applied live as migration `benchtop_p1_edge_profiles`; SQL in
  `migration_p1_edge_profiles.sql`. Types: `BenchtopEdgeProfile` in `src/lib/types.ts`.
- [x] Seeded 13: stone — Arris/Pencil Round (3r), Bullnose, Half Bullnose,
  Bevel, Mitred Apron (apron, 40 drop), Waterfall · board — Square
  Edge-Banded, Radius Edge-Banded (2r), Shark Nose, Board Waterfall ·
  postform — Postformed Front, Square Laminate Edge, ABS Edged.
  Method defaults: Built-Up → Square Edge-Banded, Stone → Arris,
  Laminate → Postformed Front.
- [x] **Settings → Benchtop Builder** is now real (was a "Coming soon"
  placeholder): `BenchtopBuilderClient` with sub-tabs Build Methods |
  Edge Profiles; same component at `/library/benchtop-methods`.
- [x] `EdgeProfilesClient`: grouped list, + New per category, edit all fields,
  delete (warns which methods use it as default), active toggle.
- [x] `EdgeProfilePreview`: cross-section SVG generated from the profile's
  fields (generates → code → radius); reusable for the canvas in Phase 3.
- [x] Build method editor: "Default edge profile" picker.
- Verified: tsc clean, lint clean on new files, headless screenshots of both
  tabs with no console errors.

### Phase 2 — Build method construction types  `[x]` (2026-10-11)
- [x] Migration `benchtop_p2_construction` (SQL `migration_p2_construction.sql`):
  `benchtop_build_methods.construction` (check: buildup_flat |
  buildup_vertical | solid | outsourced, default solid), `strip_width_mm`,
  `cross_member_spacing_mm`, `default_schedule_id` (FK, set null);
  `benchtop_resolved_parts.supply_item` (bool, default false).
- [x] Seeds: 33mm Built-Up = buildup_flat, strip 90, spacing 600, schedule
  "33mm Built-Up — Whiteboard 16.5"; 20mm Stone = outsourced, schedule
  "20mm Stone"; Laminate / Postform = outsourced, no schedule yet (no
  laminate material in the library).
- [x] **Decision (Mark, 2026-10-11): a method names its default schedule.**
  Schedule resolution order: benchtop → **method default** → room → job →
  shop default. Job colour choices go through per-role overrides
  (`job_/room_benchtop_materials`), which still overlay on top.
- [x] Shared `src/lib/benchtop-resolver/construction.ts` (labels, default
  roles per construction, `rolesForConstruction`, spacing fallback 600).
- [x] Resolver rules (rectangle/bbox — Phase 4 generalises to pieces):
  - flat: members `strip_width` wide; butt ends + cross = depth − 2×strip.
  - vertical: members `buildup_rail_depth` tall; butt ends + cross =
    depth − 2×board thickness.
  - mitre corners: ends full depth.
  - cross count = ceil((run − 2×set-back) / spacing) − 1.
  - solid: never build-up parts. outsourced: worktop / stone slab
    `supply_item = true`; substrate + fascias stay in-house.
- [x] Unit tests `src/lib/benchtop-resolver/__tests__/resolver.test.ts` (7).
- [x] Editor: construction picker, per-construction dimensions, build-up
  roles hidden when not build-up, default schedule picker. Wizard: new step 1
  "How is this benchtop built?" with cross-section art; answers pre-select
  from the method's current values. Canvas panel tags supply parts.
- Verified live: Kitchen 1073×560 → built-up strips 1073 / 380 ×2 / cross
  380 ×1; same top on 20mm Stone → one 1073×560×20 "20mm Stone" slab,
  supply item (via method schedule). Benchtop restored to inherit.

### Phase 3 — Shape Editor drawing  `[x]` (2026-10-11)
- [x] Migration `benchtop_p3_segments` (SQL `migration_p3_segments.sql`):
  `benchtop_instances.segments` + `joins` (jsonb); backfilled the 3 existing rows
  (polygon → lines, quadratic arcs → cubic curves, wall tags → `edge.wall`).
  Types `BenchtopSegment`, `BenchtopEdge`, `BenchtopJoinLine`; `join_types` deprecated.
- [x] `src/lib/benchtopGeometry.ts` — the one place outline maths lives:
  `btSegments` (stored or legacy fallback), `shapeWrite` (segments + derived
  polygon / arc_segments / edge_tags — always write through it), transforms
  (move / rotate / mirror carry joins + cutouts), moveVertex, split, delete
  vertex, curve toggle / drag, true-radius fillet (SVG arc), chamfer, offset,
  outward normals, effective profile, join snapping. 19 unit tests.
- [x] ShapeEditor: `edgeOptions` prop (Wall / Exposed + profile picker,
  multi-select, one undo step; profile colour + code drawn on edges),
  `boundsCheck={false}` (no datum error / part rect / datum panel). Cabinet
  parts unchanged. Fixed a latent crash: `selSegRef` / `hoverSegRef` were never
  declared (hovering / list-selecting a segment threw). README updated.
- [x] `BenchtopShapeEditor` overlay: double-click a benchtop (click-count in the
  hook — the plan captures the pointer, native dblclick never arrives) or
  "Edit shape & edges…" in the panel. Frame = room shifted by the union bbox
  of the top + nearby walls / cabinets / other benchtops (reference outlines).
- [x] **F4 → Draw in Shape Editor** (Mark, 2026-10-11): new benchtop drawn
  straight in the overlay. Starts from the footprint bbox of the selected
  cabinets (else 1200 × 600 mid-view); whole room shown as reference; the row
  is only inserted on Save (Cancel leaves nothing). The plan quick-draw tools
  (polygon / rect / L / U) stay.
- [x] Plan: renders from segments (curves + true arcs); layer items
  `benchtop_edges` (profile colour + code, wall edges dashed grey) and
  `benchtop_joins` (dashed red line, B / M tag). Vertex butt/mitre flags gone.
- [x] Joins drawn on the plan (P-b): "+ Add join line" → click two points on the
  outline (snap to edge; Ctrl = square across); a new join starts with the
  method's `default_join_type`. Panel lists joins with Butt /
  Mitre + delete. Joins don't split anything yet — Phase 4.
- [x] BenchtopPanel: per-edge list (Wall/Exp, profile picker with the method
  default), lineal metres per profile, joins. `useBenchtopCatalog` resolves the
  effective method (benchtop → room → job → default) for the default profile.
- [x] Fixed: benchtop draw modes (U, cutouts, join) deselected the benchtop on
  pointer-down, and clicks on a benchtop were swallowed in draw modes.
- Verified: tsc clean, 233/233 tests, headless run on Living (edit edge → Wall,
  set BN profile, save → DB segments + derived edge_tags correct; join drawn
  square across 425, Mitre toggle saved). Test benchtop restored afterwards.

### Phase 3b — Wall anchoring, movement lock, elevation + 3D  `[x]` (2026-10-11)
Mark (2026-10-11): benchtops must not drag-move like cabinets (too easy to
knock); they must anchor to a wall like cabinets so they read on a specific
elevation; they must show in plan, elevation and 3D. P-e…P-i **LOCKED** (Mark:
"yes to all" — fully locked, no unlock toggle; plan corner drag removed too; L/U
tops show on every wall they touch; height = base cascade + per-top override).

- **P-e Anchor** — `benchtop_instances.wall_id` + `wall_side` (same meaning as a
  cabinet's `cabWallSide`, so island tops anchor to an island wall + side).
  Geometry stays in the room frame (like cabinet `pos_x/pos_y`); when the anchor
  wall moves or rotates, the top gets the same rigid transform as its cabinets.
  Each wall edge also records which wall it sits against (`edge.wall_id`,
  auto-detected on save: edge lies on that wall's face within a few mm), so an
  L / U top knows every wall it touches. Existing rows: auto-anchor to the
  wall their longest wall-edge sits on.
- **P-f Movement lock** — no click-drag move and no rotate handle. Click =
  select only. Position changes are deliberate: (1) panel "Position" — offset
  along the anchor wall from its start + distance off the wall face, typed;
  (2) a **Move** command (base point → target point, snapped, Esc cancels);
  (3) "Re-anchor to wall…" (pick a wall). Orientation follows the anchor wall.
  Plan vertex dragging also goes — outline edits happen in the Shape Editor.
  Edge tags / curve toggles on the plan stay (they don't move the top).
- **P-g Height** — underside = the base height cascade (job
  `class_dimension_defaults.base.dy` → room override), per P-c revised; surface =
  underside + thickness. Optional per-benchtop `height_mm` = underside override
  (panel "Sits at"). (Alternative
  considered: read the tallest base cabinet under the top — rejected as default,
  a gap / empty bay would drop the top.)
- **P-h Elevation** — a wall's elevation shows every top that has an edge
  against that wall (P-e), on that side. Drawn as a band from underside to top
  over the top's extent along the wall axis; return legs of an L seen end-on
  appear as their own short band; build-up line (top / strip) for built-up
  methods; waterfall legs drawn down to the floor; profile code on the front
  edge. Layer item `benchtops` gains `elevation` + `3d` views (same id).
- **P-i 3D** — outline (cutouts as holes) extruded by thickness at the P-g
  height; waterfall legs as panels to the floor (mitred); colour from the
  schedule material / surface. Gated by the same layer item.

Built:
- [x] Migration `benchtop_p3b_anchor` (`migration_p3b_anchor.sql`): `wall_id`
  (FK walls, on delete set null), `wall_side` ('face' | 'back'), `height_mm`.
- [x] `src/lib/benchtopAnchor.ts` (+ 10 unit tests): wall face frames, `wallContacts`
  (straight edge within 10 mm of a face, top on that side), `autoAnchor` (longest
  contact, else nearest face on the top's side — islands), `btShowsOn`,
  `btPosition` / `positionFn`, `reanchorFn` (rigid, never mirrored), `btTouches`.
- [x] **Changed from the proposal**: per-edge `edge.wall_id` is NOT stored — contacts
  are derived from geometry every time (can't go stale). Wall / exposed tags are
  not consulted for contacts.
- [x] **Wall-follow not built**: cabinets don't follow a moved wall in this codebase
  (pos_x/pos_y stay put), so tops don't either — they stay with their cabinets.
  Revisit both together if walls ever carry their cabinets.
- [x] Auto-anchor: on insert (quick-draw + Shape Editor draft) and, for rows
  with no / a deleted anchor, on canvas load (not an undo step). All 3 live rows
  anchored (Kitchen → Wall 1 face; Living → Island 1 back).
- [x] Movement lock: press on a top = select (double-click = Shape Editor); drag
  does nothing. Removed: move drag, rotate handle, vertex drag, curve-handle drag.
  Kept (deliberate, no drag): edge tags, Alt/Shift edge clicks, vertex right-click
  menu, panel rotate / mirror / offset.
- [x] **F4 Benchtop mode** (Mark, 2026-10-11): mode `benchtop_select` (helper
  `isBenchtopMode` covers it + every draw / cutout / join / Move tool). F4 or the
  sidebar Benchtop button toggles it; Esc steps a tool back to Benchtop mode,
  then out to Select. In it only benchtops pick — plan walls + cabinets,
  elevation cabinets + wall face, and 3D cabinets are click-through / inert.
  Outside it benchtops are click-through (plan, elevation, 3D) so cabinets own
  every click. Crossing the boundary drops the other kind's selection; the
  cabinets selected on the way in still seed Draw in Shape Editor. Benchtop
  tools finish back in Benchtop mode, not Select. Fixed on the way: the canvas
  key handler's effect didn't depend on `mode` (F4 / Esc read a stale mode).
- [x] **Typed sizes while drawing** (Mark, 2026-10-11): `BenchtopDrawPanel` beside the
  plan for rect / polygon / L / U — Rect: Width / Depth (direction follows the
  mouse); others: Length / Angle of the current side, L / U also Depth (replaces
  the fixed 600; previews use it). Fields follow the mouse until typed; Tab
  (also from the canvas) moves between fields and previews; Enter places the
  point — the last one commits. Typed points go through the same pointer-up
  path unsnapped (`handlePointerUp(pt, exact)`). Polygon gets "Close shape".
  L / U lengths run along the clicked front edge, depth behind it.
  Sidebar Benchtop button reopens the tool menu when in Benchtop mode with it
  closed (only leaves the mode when the menu is open); F4 still toggles.
  Verified headless: typed 1800 × 650 rect; L 2000 / 1500 @ depth 650.
- [x] **Waterfall joint per edge** (Mark, 2026-10-11): edge.waterfall_join = mitre (default) | butt; B / M toggle on waterfall edges in the panel; plan + elevation label ▼M / ▼B. Mitre = leg to the top surface, 45° at the corner (elevation: band and end-on leg share the diagonal; face-on leg runs to the top edge; 3D: slab cut back by T, leg prism with the 45° face + corner wedge). Butt = the top sits ON the leg (leg stops at the underside; 3D leg box under the top). Phase 4: leg part length = topZ (mitre, both ends 45°) vs base height (butt).
- [x] **Waterfall legs block cabinets** (Mark, 2026-10-12): `src/lib/waterfallObstacles.ts` — each waterfall leg (edge strip inset by the top thickness, floor to top surface) is added to the `occupied` ranges for cabinet place / move / stretch / paste in plan + elevation, on the wall + side within the mover's depth. Wall units above the top are not blocked. Typed positions in the cabinet panel (`CabinetPanel`, `useCabinetOps`) not yet covered.
- [x] **Editable sizes in the panel** (Mark, 2026-10-11): Size card — Length (a
  'Length grows from ◀ Left / Both / Right ▶' toggle picks the end that moves;
  default Right), Depth (front edge moves, back stays on the wall), Sits at / Top
  at (underside override); Thick (build method) + Area read-only. Position —
  From left end / From right end / Off wall (move the whole top, like cabinets),
  and Overhang past cabinets Left / Right / Front (editing one moves only that
  edge; red when the top falls short). Overhang = base cabinets on the anchor
  wall + side (island: either side). Resize = `stretchFn` (benchtopAnchor): every point past the
  halfway line on the moving side shifts, so L legs / U arms keep their width;
  joins stretch, cutouts move whole. Verified headless on Living + Kitchen.
- [x] Panel **Position**: "Anchored to" (wall + side; a wall the top already
  touches just re-anchors, else the top is carried there — flush to a wall face,
  same offset from an island line), Along wall / Off wall (typed), Top height
  (blank = base cascade; amber when overridden), thickness readout, **Move…**
  (base point → target, snapped, ghost preview, Esc cancels; landing against
  another wall re-anchors there).
- [x] Height (P-g, P-c revised): underside = `height_mm ?? resolveClassDims('base',
  room/job/shop).dy`; surface = underside + thickness. Panel field "Sits at"
  (underside) with a "top at …" readout.
  Thickness (display): `useBenchtopCatalog.thicknessFor` — schedule cascade as
  loadBenchtopInput; worktop board/surface dz; + strip dz (buildup_flat) or
  + rail depth (buildup_vertical). Job/room per-role material overrides not applied.
- [x] Elevation: `BenchtopElevation.tsx` inside ElevationSVG after the cabinets —
  band, front-face step dividers, build-up line, waterfall legs + mitre, join
  seams (B/M), profile codes under front edges, label + height; click selects.
- [x] 3D: `BenchtopMesh` in Room3DScene — extruded outline with cutout holes,
  waterfall leg boxes (line edges), hidden with its anchor wall, click selects.
- [x] Layers: `benchtops` → plan / elevation / 3D; `benchtop_edges` + `benchtop_joins`
  → plan / elevation (same ids).
- Verified: tsc clean, 243/243 tests; headless on Living — drag leaves segments
  byte-identical; typed Along +100 moved 100; Move… moved 298 up, anchor kept;
  re-anchor to Wall 1 carried it flush to the face; elevation band on
  Island 1 back (re-checked after the P-c revision: 900 → 920 for 20 mm stone); 3D slab selected. Test row restored.

### Phase 4 — Resolver rewrite  `[x]` (2026-10-11)
Started on Mark's go ("start phase 4"). Rules Q-a…Q-h are Claude's defaults —
**PROPOSED, Mark to confirm or change** (open questions at the end).

- **Q-a Pieces** — the outline is cut by its join lines (`pieces.ts`
  `splitIntoPieces`: join ends are made outline vertices, the loop is cut along
  the chord; joins that miss the outline are skipped). One worktop / stone /
  subtop panel per piece, sized along the piece's long axis (its longest straight
  edge) — rotated tops size correctly. Shaped pieces carry `outline` (part frame).
  Labels gain "— Piece n" only when there are joins.
- **Q-b Perimeter members** — a build-up strip / rail along EVERY piece edge (wall,
  exposed, join, curved). Butt corners: the member along the long axis runs
  through, the other is set back (strip width / board thickness); else the longer
  runs through. Mitre (`corner_join_type`): all full length. Rectangles give
  exactly the Phase 2 numbers (old tests unchanged).
- **Q-c Cross members** — at the method spacing along the long axis; each is cut
  to the top's real width at that point (scanline), minus set-backs.
- **Q-d Fascias** — front / back / side from the exposed edges per piece (front =
  long-axis edges facing away from the wall; island: the longest exposed side).
- **Q-e Waterfall leg** (`waterfall_panel`) — worktop material at worktop
  thickness; width = edge length; length = sits-at + thickness (mitre, 45° top)
  or sits-at (butt). Base height comes from the cascade (loader).
- **Q-f Apron strip** (`apron_strip`) — profile `generates = apron`: edge length ×
  `apron_drop_mm`, worktop material + thickness.
- **Q-g Cutouts** — assigned to the piece holding their centre; recorded in
  `meta.cutouts` (w × h, round) — not cut out of build-up members.
- **Q-h Outsourced** — worktop / stone / waterfall / apron parts are supply items;
  every top panel carries `meta`: area m², lineal mm per profile code, cutouts,
  waterfall count, joins (type + length).
- Shared `topThickness` / `topRow` (resolver) now also drive the canvas display
  thickness (`useBenchtopCatalog`) — the elevation draws what the parts list cuts.
  Fixed: the top's material came from the worktop row even for stone-slab-only
  methods.
- Migration `benchtop_p4_resolved_pieces` (`migration_p4_resolved_pieces.sql`):
  `benchtop_resolved_parts.piece / outline / meta`. New roles are text values.
- Panel parts list shows "shaped" + area / lineal m / cutouts / joins; Reports
  tags supply items "— supply" (Phase 5 moves them to a supply sheet).
- Tests: 9 new (`__tests__/pieces.test.ts`) — L split by a mitre join, single-
  piece L members + set-backs, cross members at real width, rotated top, island
  waterfall mitre / butt, outsourced meta, apron, stale join. 268/268.
- Verified live: Kitchen → one 1073 × 560 20mm Stone supply item (0.6 m², ARR
  3.27 lm); Living Benchtop 2 with a temporary butt join + WF ends → two 1218 × 426
  pieces, mitred leg 920, butt leg 900. Restored + re-resolved.

**Phase 4 questions — LOCKED by Mark 2026-10-12 (defaults kept):**
1. Single-piece L / U (no join): cross members only across the long run; the
   return leg gets perimeter members, no cross members.
2. Built-up waterfall legs: one worktop-thickness panel (no build-up on the leg);
   perimeter members still run along the waterfall edge under the top.
3. Non-square corners (45° join chords): set-back taken along the edge, not
   angle-adjusted.

### Phase 5 — Outputs  `[x]` (2026-10-12)
- **R-a Supply sheet** — Reports → "Benchtop Supply" (room / job scope):
  every `supply_item` row as an order line — top, item (+ waterfall butt /
  mitre), length × width × thickness, qty, material, m², lineal m per edge
  profile code, notes (shaped outline thumbnail, cutouts, joins). Totals: m² +
  item count per material / thickness, lineal m per profile, cutout / waterfall
  leg / join counts (a join is on both its pieces — counted once). Print / PDF
  via the modal button. Builder: `benchtop-resolver/supply.ts`; view:
  `BenchtopSupplyReport.tsx`.
- **R-b Parts List Summary** — supply items removed (the interim "— supply"
  tag is gone); it lists only cut parts.
- **R-c Optimiser** — in-house parts (rows with a board `material_id`, not
  supply) join the snapshot via `optimiser/benchtopParts.ts`, from both the
  server page and the batch loader: `source_table = 'benchtop_parts'`, the
  benchtop stands in for the cabinet (room / cabinet filters work), one part per
  unit of quantity ("Strip — Cross 1/2/3"). Footprint h = along the grain
  (length) unless the row's grain is `width`. Shaped pieces carry their
  outline as `shape` (rotated, not mirrored) and nest at the bbox like other
  shaped parts. No edgebanding deduction.
- **R-d Read-only in the optimiser** — no rename / comment (no cabinet row to
  store them); no part_operations (excluded from drill / route sync).
- **R-e Size overrides** — none for benchtop parts (`sizeOverrides` case).
- **R-f Follow-ups, not built** — benchtop edgebanding per edge on the cut
  list; cutouts / profiles as CNC ops; supply sheet export to CSV.
- Tests: 5 new (`__tests__/outputs.test.ts`). 286/286.
- Verified live: Living supply sheet → Benchtop 2 Stone Slab 2435 × 426 × 20,
  1.04 m², ARR 5.72 lm; Parts List has no stone rows. Benchtop 2 switched to
  33mm Built-Up + resolved → 8 parts in optimiser Stage 2 (worktop 426 × 2435,
  front / back strips, 2 ends, 3 cross members, 16.5mm board). Restored to stone.

### Deferred
Splashback module · CNC machining of profiles · automatic panel splits ·
sharing the profile library with cabinet-part shapes.

---

## Session log
- 2026-10-12 — Phase 4 questions locked (defaults kept); Phase 4 committed.
  Phase 5 done (supply sheet report, benchtop parts in the optimiser).
- 2026-10-11 — Audit done, decisions 1–7 locked, spec created. Phase 0 done
  (cleanup, seeds, worktop-thickness fix, first live resolve). P-b (join
  lines) locked. Phase 1 done (edge profile library + Settings tab).
  Phase 2 done (construction types, method default schedule, supply items).
  P-a / P-c / P-d locked. Phase 3 done (segments storage, Shape Editor
  overlay with edge profiles, plan edge + join layers, join tool).
