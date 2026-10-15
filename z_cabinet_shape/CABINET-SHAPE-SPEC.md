# Shaped Cabinets — Spec & Phase Tracker

> **Purpose**: the living spec for non-rectangular ("shaped") cabinets —
> clipped/angled corners, diagonal corners, angled ends, radius ends, and
> cabinets with more than one front face. Survives chat wipes — update status
> lines and decisions in the same change as the code.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → Phases 1–2 (5dca77a), 3a (685786f), 3b (c405730), 3c + 4a
> (angled carcass joints, square/bevel front ends, doors clear angled sides) committed
> 2026-10-14 (49ed16e), all checked in-app. 4b (toe kick follows the shape) committed
> 2026-10-15 (most of it rode in WIP c7d1633), checked in-app. 4c (new benchtop
> follows the cabinets' outline, decision 16) built 2026-10-15, awaiting in-app check.
> Library still needs a hinge with Mount° = 45.
> **L corner (BCNP)**: L1 + check-#1 fixes + L3 drilling built 2026-10-15 (uncommitted), awaiting in-app check → then L2 bi-fold (Phase L).

---

## Concept in one paragraph

A cabinet gets an optional **footprint**: a closed plan-view outline (Shape
Editor segment format: lines + arcs) where **every edge carries a role** —
`back`, `side`, `front`, `open`, `scribe`. Every part is derived from that one
outline + roles: one panel per side/back edge, horizontals (bottom, top/rails,
shelves) = outline offset inward, toe kick = front edges offset back, and **one
face grid per front edge** (multi-facet fronts). A null footprint = today's
rectangle and runs the existing resolver untouched. **Presets** (clipped corner,
diagonal corner, angled end, radius end…) are just parametric generators of a
footprint, so presets and later free-form editing share one data model.

## Why this design (research summary, 2026-10-11)

| Product | Approach | Breaks on |
|---|---|---|
| Microvellum | one master product per shape, angle-aware subassemblies | product explosion; users "need SIN/COS/TAN"; angled 5-piece doors draw wrong |
| Cabinet Vision | preset Corner 45/90/Clipped classes + xShaping add-on; horizontals follow outline | fallback = hand-edit parts in Part Editor |
| Mozaik | Edit Cab Shape (drag vertices) | shape scales proportionally on resize; 45°-only end mitre option |
| Thermwood eCabinets | box + "Angle Part" | doors stay on the original square box; backs short; mitre math assumes 45°/¾" |
| Polyboard | free plan outline, **each line tagged front/back/side** | straight lines only |

Gaps nobody fills: **multiple faces per cabinet with independent face grids**,
**shape recognition**, joints derived from **any** angle, toe kick following
the shape. (KCD / 2020 / IMOS / Planit unverified — no usable sources.)

Precedent in this repo: benchtops (`z_benchtop_builder/BENCHTOP-SPEC.md` P-a) —
`segments` jsonb in Shape Editor format with a per-edge tag, wall contacts
derived from geometry (`src/lib/benchtopAnchor.ts`). Same pattern here.

---

## Locked decisions (Mark, 2026-10-11)

1. **Angled joints are manufacturable** — the shop can cut mitres/bevels. The
   joint resolver may emit mitre/bevel joints at any angle (not just 45°), with
   thickness compensation computed, and these must reach cut list / CNC output.
2. **Frameless only** this round. No face-frame shaping.
3. **Elevations show facets at true width** (unfolded), both in per-cabinet
   views and wall elevations. A foreshortened (orthographic) wall view is a
   possible later toggle, not built now.
4. **Presets first.** Ship parametric presets (angle, radius, etc.) before any
   free-form footprint editing.
5. **Null footprint = rectangle = existing resolver path**, unchanged. No
   migration of existing cabinets.
6. **Shape is a code modifier, not a config** (Mark, 2026-10-12). Codes describe
   the box (cabinet-codes skill core principle); shape is orthogonal to the door
   config, so it rides after `/` like `/L` `/R` `/SC` — not `-` (that's the
   drawer-stack separator; `D3-SLL-L` would be ambiguous). Modifiers:
   `/AE` angled end · `/CC` clipped corner · `/RE` radius end · `/TZ` trapezoid,
   side via `/L` `/R`. e.g. `D3-SLL/AE/R`, `B2D/CC/L`, `BOPN/RE/R`.
   Diagonal corner keeps its config code `BCNL` / `WCNL`.
7. **No shaped entries in the library yet** (Mark, 2026-10-12) — get shaped
   cabinets working on the canvas first. The modifiers are agreed but not yet
   added to the parser (`rhk-crm/lib/cabinetCodes.ts`) or the skill.

8. **Built for hand-editing from day one** (Mark, 2026-10-12). Phase 1 must not
   paint free-form editing (Phase 6) into a corner:
   - `segments` is the **single source of truth**. `preset` + `params` are
     provenance only. Every consumer (plan, 3D, resolver, elevation) reads
     `segments`, never `params`.
   - **Stable edge ids.** Faces and role overrides key off `edge.id`, never the
     segment index. Moving a vertex keeps ids. Splitting an edge keeps the id on
     one half and gives the other a new id. Deleting an edge orphans its face
     grid with a visible warning; it is never silently re-attached.
   - **Vertices are formulas.** e.g. `x = W - 300`. A hand-dragged vertex is
     re-expressed against its nearest bbox side (`W - 250`), so resize still
     behaves.
   - A hand edit sets `preset: null` and keeps `from_preset` as history.
     "Re-apply preset" regenerates the shape from that preset.
   - Roles live on `edge`, the same mechanism as benchtop `{wall}`. The Phase 6
     editor is the Shape Editor with a role `edgeOptions`.

9. **Facet-to-facet door junction defaults to mitred door edges** (Mark,
   2026-10-12). Where two front facets meet, the doors are bevelled to meet on
   the corner line (half the facet angle each). Reveal / fixed post stay
   available as per-vertex options (S-c).
10. **Doors on an angled facet hinge on the adjacent side panel with an angled
    hinge** sized to the facet angle (e.g. +45°), flagged on the hardware list
    (Mark, 2026-10-12). Built 3b: `hardware_hinges.mount_angle_deg` (library
    column "Mount°") = corner angle − 90°; the resolver picks the library hinge
    within 2.5°, else uses the default hinge and flags it (warning
    HINGE_ANGLE_MISSING, hardware list "NOT IN LIBRARY — order").

11. **Angled panel joints are a rule** (Mark, 2026-10-14): `ANGLE_JOIN` =
    `butt_bevel` (default: the BACK_JOIN priority still picks the through panel;
    its end lies flush in the outline, the stopping panel's end is bevelled flat
    against it) | `mitre` (both bevelled on the corner line). Set on the
    construction method, job, room or cabinet like any rule. Applies only to
    corners off 90° by more than 0.5°; square corners keep the butts.
12. **Panel ends at an angled front stay square by default** (Mark, 2026-10-14,
    revised same day — first locked as "always bevelled flush"). Per part, a 3D
    right-click **"Bevel front edge to facet"** / **"Square front edge"** toggles
    it; stored as `footprint.flush_ends` (edge ids), kept when the preset is
    rebuilt. Also applies at angled `open` edges.
13. **Toe kick on a shaped cabinet: one board per front facet, mitred** where
    they meet (Mark, 2026-10-14).
14. **Phase 4 is split 4a / 4b / 4c** with an in-app check each (Mark, 2026-10-14).
15. **L corner (pie) = `BCNP`** (Mark, 2026-10-15). Square L footprint on a 900 × 900
    box; both leg depths = the run's base depth (room → job → shop cascade) **at
    placement** — like every other cabinet's depth, a later room change doesn't move
    it. `BCNR` stays blind corner (rhk-crm's hinge picker reads it). Doors are a
    **bi-fold pair** (Phase L2). Decision 7 is lifted for BCNP only: it's the first
    shaped library entry.
16. **New benchtop over shaped cabinets** (Mark, 2026-10-15). F4 → Draw in Shape
    Editor starts from the selected base cabinets' real outlines merged, every front
    edge (angled facets too) pushed out by the front overhang, measured from the
    carcase: **40 mm with handles** (door 16–18 + 2 bump-on + ~20 so the handle
    doesn't stick out past the top), **25 mm with finger pulls** (3–5 mm past the
    doors to get fingers under the top drawer). Picked from the room's handle
    schedule (door_base / drawer roles; any hardware handle or nothing set → 40).
    **New tops only** — existing tops are not re-fitted.

## Proposals (not yet locked)

- **S-a Storage** — `footprint jsonb` on `cabinet_instances` and
  `cabinet_definitions`:
  ```jsonc
  {
    "preset": "clipped_corner",          // null = free-form
    "params": { "clip_x": 300, "clip_z": 300, "side": "right" },
    "from_preset": "clipped_corner",     // history, survives a hand edit
    "segments": [                        // Shape Editor format (p0/p1/rx/ry/sweep), cabinet frame:
      // x along the width (0 = left side), y = depth (0 = back, cab.d = front)
      { "type": "line", "p0": {"x":0,"y":0}, "p1": {"x":900,"y":0},   // cached numbers
        "p0_expr": { "x": "0", "y": "0" },                           // live vertex formulas
        "edge": { "id": "back", "role": "back" } },
      ...                                 // arcs also carry "r_expr"
    ],
    "role_overrides": { "facet": "open" }  // user overrides survive regeneration
  }
  ```
  `dx` / `dz` stay as the footprint bbox (keeps every bbox consumer working).
  `dy` (height) unchanged — footprints are vertical prisms this round.
- **S-b Edge roles**: `back` · `side` (`finish`: finished | unfinished |
  neighbour) · `front` (owns a face grid) · `open` (no panel, exposed shelves) ·
  `scribe` (side panel with scribe allowance against a wall).
- **S-c Faces per front edge** — `face_grid` becomes a map keyed by edge id:
  `faces: { [edgeId]: FaceGridInput }`. Rectangle cabinets keep the single
  `face_grid` (= `faces[front]`). Each facet resolves in its own frame
  (DX = facet true width). Where two front facets meet: per-vertex choice
  `reveal` | `mitre` (doors bevelled) | `post` (fixed stile).
- **S-d Presets are formula-driven** — vertices are expressions of the cabinet
  dims + preset params via the formula engine (`z_formulas/`), so resizing
  900 → 1000 keeps a 300 clip at 300 (fixes Mozaik's proportional scaling).
- **S-e Recognition (after presets)** — when a footprint is edited free-form,
  classify edges (touching wall → back/scribe, touching neighbour → side,
  longest room-facing → front, short angled edge → ask: facet / finished end /
  open) and match the outline to a preset archetype for construction defaults +
  cabinet code. Wall/neighbour contact derived from geometry each time, like
  `wallContacts`.
- **S-f Radius edges** — arc segments with role `open` (radius end shelf unit)
  are in scope with the presets. Arc with role `front` (curved doors) needs a
  curved-door supply decision — treat as outsourced door, report-only, until
  decided.

## Preset list (Phase 1 candidates)

| Preset | Params | Edges (default roles) | Code |
|---|---|---|---|
| `clipped_corner` | clip_x, clip_z, side | back, side, front, **front (angled facet)**, side | — |
| `diagonal_corner` | return_l, return_r (depths) | back, back, side, **front 45°**, side | BCNL/WCNL (proposed) |
| `angled_end` | angle or end depth, side | back, side, front, **side (angled, finished)** | — |
| `l_corner` | leg_back, leg_side (class depth), side | back, side, front, **front (inside corner)**, side, back | BCNP |
| `radius_end` | radius, side | back, side, front, **arc (open shelves)** | — |
| `trapezoid` | front width, back width | back, side (angled), front, side (angled) | — |

Codes: diagonal = `BCNL`/`WCNL`; the rest use the shape modifiers (decision 6).

---

## Phases

### Phase 0 — Spec `[x]` (2026-10-11)

### Phase 1 — Footprint data + presets + plan `[x]` (2026-10-12, checked in-app by Mark)
- [x] Migration `migration_s1_footprint.sql`: `footprint jsonb` on instances + definitions (S-a), applied
- [x] `src/lib/cabinetShape/footprint.ts` (types, `evaluateFootprint`, outline, per-edge plan runs) +
      `presets.ts` (5 presets, formula vertices `cab.w`/`cab.d`/`p.*`, stable edge ids, left/right mirror,
      warnings) + tests
- [x] `cabinetCornerPts` / `cabinetPolygon` return the shaped outline, evaluated at the live size, so
      resize, move ghosts, marquee hit-test and the plan report all follow (new `cabinetToPlan`)
- [x] Plan render: outline in the `carcass_outline` layer; front-role edges drawn in the `doors` /
      `drawer_fronts` layer. Box-shaped resolved parts, the internal inset and door swings are hidden on
      shaped cabinets until Phase 2/3 (CanvasSVG + PlanViewReportSVG)
- [x] Shape section in the cabinet panel (`CabinetShapeSection.tsx`): preset, end side, params, per-edge
      role (role_overrides). Replaces "placeable from library" (decision 7: no library entries yet).
      A footprint copies through Save-to-library and placement.
- [x] In-app check (dev server)
- Not yet shaped: elevation, 3D, resolver parts — all still the bbox (Phases 2–5)

### Phase 2 — Case resolver `[x]` (2026-10-12, checked in-app by Mark)
Design (locked in code):
- `resolveShapedCase.ts` runs after the box `resolveCaseParts` and reshapes it, so every
  join / height rule (BACK_JOIN, BOTTOM_JOIN, RAIL_JOIN, TOP_TYPE) still comes from one place.
- **Legacy keys kept where they fit**: a side edge on x=0 / x=DX stays `left_side` / `right_side`,
  a back edge on y=0 stays `back` — trimmed to the edge. Hinges, seams, drilling, slides and the
  cut list keep working for them. Box parts with no edge left are dropped.
- **Other side/back edges** → `side:<edge>` / `back:<edge>`: 'face'-kind panel (DY length,
  DX height, DZ thickness inward), `AY` = rotation about its outer start corner
  (three.js Y, pivot = box min corner). Heights copy the box side / back.
- **Front facets** (not the straight front) → `rail:<edge>` top rail when TOP_TYPE has rails.
  The straight front keeps `front_rail`; no straight front (diagonal) → no `front_rail`.
- **Horizontals** (bottom, full_top, rails, adj/fixed shelves) = box rect ∩ inset polygon
  (footprint pushed in by the panel thickness on side/back edges, 0 on front/open edges;
  BOTTOM_JOIN bottom_outside / RAIL_JOIN on_top_of_sides clip to the outline instead).
  Non-rectangular results carry `outline` (horizontal Shape Editor frame) → persisted in
  `case_parts.outline` / `internal_parts.outline` (migration_s2) → rendered via the
  existing shape path (a user shape override still wins).
- **Butt joints only**, priority side > back (BACK_JOIN behind_sides flips it), ties → earlier
  edge. Square ends; an angled butt leaves a small gap (never an overlap). Inner faces are kept
  inside the outline at acute corners. Mitres/bevels = Phase 4.
- Curved (arc) side/back edges get no panel yet → `SHAPE_CURVED_PANEL` error, treated as open.
- Scribes (SCRL/SCRR/SCRBK) apply only through the kept legacy parts.

- [x] `src/lib/cabinetShape/construct.ts` (winding, inset polygon, convex clip, butt trims) +
      `resolveShapedCase.ts` (case + shelves) wired in `resolver.ts`; tests (`shapedCase.test.ts`)
- [x] DB: `case_parts_part_key_check` widened to `side:|back:|rail:<edge>`; `outline` columns (applied)
- [x] Consumers routed through `cabinetShape/partKeys.ts`: caseBox (+ `casePlanCorners`,
      `caseBoxAABB`), layer registry, formula `caseAxes`, optimiser `caseFrame` / `boxAxes`,
      OverridesView frame, ElevationSVG + ortho views (AABB), 3D (`caseRot` = AY + override,
      'face' kind, labels, resolver outlines → `shapes3D`), plan + plan report (turned panels,
      outlines; kick / fronts / drawer hardware still hidden on shaped cabinets)
- [x] In-app check
- Known gaps: seams/joints/drilling are not generated for the new per-edge parts (fixed seam
  list); the optimiser nests the bbox and does not cut outlines (Phase 5); Part Editor does
  not yet show resolver outlines; toe kick + doors still box-built in 3D (Phases 3–4);
  already-saved shaped cabinets re-resolve on their next edit (no page-load sweep).

### Phase 3 — Multi-facet faces `[~]`
Split 2026-10-12 into 3a / 3b / 3c (the face pipeline has ~40 consumers).

Design (locked in code, 3a):
- Every straight `front` edge is a facet. **Primary facet** = the straight front (y = DZ),
  else the longest front edge (diagonal corner). It uses `face_grid` and keeps
  `zone_<r>_<c>` ids, so existing overrides / hinges / drawers are untouched.
- Other facets: `cabinet_instances.faces[edgeId]` (default: one door hinged toward its side
  panel); zone ids `zone_<edge>.<r>_<c>` (dot = legacy `split('_').map(Number)` parsers get
  NaN, never a primary zone). Helpers `zoneKey / zonePartId / parseZonePartId` (partKeys.ts).
- `resolveShapedFace.ts` runs the ordinary `resolveFace` per facet in a facet-local frame
  (new optional `FaceFrame`: width, end reveals, door-key prefix), then turns zones onto the
  facet: AY about the zone min corner, +X → along the facet to the right, +Z → outward. A facet
  on y = DZ is exactly the box front (test: rectangle-shaped footprint == plain fronts).
- Facet ends: side panel on x=0 / x=DX → the box's left/right neighbour reveal; other panel or
  open → end reveal; convex facet corner → **mitre** (decision 9): rev = GAPC/4 − tan(φ/2)·(door
  mid-thickness offset), zone `bevel_l` / `bevel_r` = φ/2; concave facet corner → GAPC/4 gap.
- Door styles: facets resolve under `resolved_doors['<edge>.<r>_<c>']`, '*' = room/job default.
- DB (migration_s3): `faces` jsonb on instances + definitions; `facet` text default '' on
  face_zones / face_rows / face_cols with the unique keys rebuilt to include it; face_zones
  gained `ax/ay/az` (it had none) and `bevel_l/bevel_r`.

- [x] 3a — resolver (`resolveShapedFace.ts`, tests `shapedFace.test.ts`), persist + reload
      (facet, AY, bevels), loader (facet grids + door styles), 3D (`turnZone` turns the whole zone
      incl. swing/hinges), plan (turned door outlines), elevation + ortho views (turned bounds),
      zone id helper across 13 files, facet-aware edge-band writes/reads, Face Grid editor facet
      picker (`FacetFaceGridEditor.tsx`)
- [x] Mitred doors drawn with their true bevel (Mark's first check, 2026-10-12: doors were
      square boxes — backs overlapped ~6 mm, fronts ~8 mm apart). `zoneBevelOutline` (jointDrilling)
      = top-view trapezoid (DX at mid-thickness, front face longer); 3D extrudes it up
      (`PartShape.extrude = 'up'`, incl. the door-swing path); plan draws it turned by AY.
      Test: both doors' back corners and front corners meet within 2 mm.
- [ ] 3a in-app check
- [x] 3b — hinges + drawers on every facet (2026-10-13). `resolveShapedHardware.ts`:
      - **Frame**: facet hardware is resolved in the zone's square frame (before its AY turn) and
        carries `turn` (HardwareTurn: AY about the zone min corner); `hardwareTurn.ts`
        (`turnPoint / turnDir / turnDrill`) maps it to cabinet coords. 3D draws it inside
        `turnZone`; world-fixed drill markers, plan, 2D ortho and the flattened drill lists
        (`cabinetSlideDrills / cabinetHingeDrills`) turn it; elevations use
        `frontViewHardware` (view copy: X extent of the turned footprint).
      - **Hinges** (`hingeMount`): side-hung door on a shaped cabinet hangs on the panel at that
        end of its facet (left = next edge, right = previous). Plate on the panel's inner face,
        plate-offset back from the door back plane, bored square into the panel (drill `dir`).
        Mount angle = corner angle − 90° → angled hinge pick (decision 10). No panel at that end
        (mitred corner / open / curve) → HINGE_NO_PANEL warning, no plate. Applies to primary
        doors too (trapezoid / angled end).
      - **Drawers** (`drawerOpening`): the inner polygon in the zone frame, sliced across the
        depth; box = widest rectangle within the zone's width that stays inside; depth = deepest
        with ≥ 100 mm width, less SCRBK + SLIDE_SETBACK, then the usual slide pick. Runner side
        with no square panel → DRAWER_RUNNER_PACKER (one per facet side); boxes of different
        facets overlapping in plan + height → DRAWER_FACET_CLASH; < 100 mm depth → DRAWER_NO_ROOM.
        A rectangle-shaped footprint gives exactly the plain boxes / hinges (tests).
      - **Ids / DB** (migration_s3b): `hinge_instances.facet` (identity key rebuilt incl. facet),
        `drawer_box_parts.facet`, RPC merges hinges by facet; resolved hinges are also saved in
        `resolved_drawer_hw.hinge_instances` (the DB rebuild can't redo facet hinges without the
        footprint — older saves still rebuild primary square doors only). Part ids:
        `dbPartId / stackKey` (`db_<edge>.<r>_<c>_<type>` on a facet), hinge ids
        `hinge_<zoneKey>_<n>`.
      - Tests: `shapedHardware.test.ts`.
- [x] 3b in-app check (Mark, 2026-10-13: "looks good")
- [x] 3c (2026-10-14):
      - **Mitre blanks**: a mitred front is cut at its front-face width and bevelled after —
        `zoneBlank` (x0 ≤ 0, width = DX + overhang each bevelled side) / `zoneBevelNote`
        ("mitre L22.5° R22.5°") in jointDrilling. Cabinet sheet cut list, Parts list and the
        optimiser (normalize: reads `bevel_l/bevel_r`) list the blank width + note;
        `zoneFrame` puts the drill origin at the blank's left edge.
      - **CNC drilling** (seamDrillSync): facet hinges + drawers are machined. Cup / front / box
        drills are already zone-frame (= the part's own frame). Plates and runner member holes
        are turned to cabinet coords (`turnDrill`), then into an angled panel's unturned frame
        (`intoPanel`: inverse AY about its outer start corner). Runner member holes go to the
        panel the bore actually lands in (`memberPanel`); none → packer, skipped (hand-fixed).
        Ids `zone_<key>`, `hinge_<zoneKey>_<n>`, `slide_<stackKey>`. Tests `shapedDrills.test.ts`.
      - **Plan swings + drawer lines** on shaped cabinets (canvas plan + plan report) from the
        resolved zones on every facet: `cabinetShape/planSwings.ts` (`shapedFrontMarks`,
        cabinet-local; `sweepFlag`). Tests `planSwings.test.ts`.
      - **Labels / trees**: `zoneRef / stackRef` ("Angled facet R1C1") in the cabinet tree,
        object tree, Parts list and optimiser names; 3D part info shows facet + mitre + cut width.
      - **Part Editor**: `PartMeta.outline` carries the resolver outline (clipped bottom / top /
        shelves); the editor shows it — and seeds the Shape Editor with it — until the part
        has a drawn shape of its own.
- [x] 3c in-app check (Mark, 2026-10-14: "looks good")
- Known gaps: hinge GLB plate/arm models on an angled panel sit as on a square gable; 2D ortho
  hinge silhouettes skip turned doors; handle holes on facet fronts are not machined yet
  (handles module skips facet / turned fronts); optimiser nests the mitre blank as a rectangle
  (bevel sawn by hand — Phase 5 CNC bevels).

### Phase 4 — Angled joints, toe kick, benchtop `[~]`
- [x] 4a — angled carcass joints (2026-10-14):
      - `construct.ts`: `angledEnd(kind, …)` — an end is the plane through a line L, cutting the
        outer face at `sOut` and the inner face at `sIn` from the vertex. flush (L = neighbour's
        outline), stop (L = neighbour panel's inner face), mitre (L = outline → inner vertex);
        `interiorAngle`, `faceHit`.
      - `resolveShapedCase`: every panel end picks square butt (|α − 90| ≤ 0.5°, arcs, reflex),
        ANGLE_JOIN at another panel (decision 11); at an angled front / open edge square, or flush
        when the panel's edge is in `footprint.flush_ends` (decision 12; `panelFrontEnd` finds the
        edge for a part key and whether the option applies — drives the 3D right-click item).
        Parts are listed at the **blank** (longest face); `bevel_lo` / `bevel_hi` = degrees from
        square at the low / high end of the part's length axis, + = inner face shorter.
        A legacy box part (left/right side, back) only stays clamped to its box extents at an end
        that meets another box part — fixes an 18×18 hole where a diagonal corner's two backs
        meet (the box back stopped at a side that no longer exists).
      - DB (migration_s4a): `case_parts.bevel_lo/bevel_hi` (applied); persist + reload.
      - `jointDrilling.caseBevelOutline` (top-view outline, extruded up in 3D) /
        `caseBevelNote` ("bevel 19° / 33.7°"); `casePlanCorners` draws it, so plan + plan report +
        AABBs follow. Cut list, Parts list (+ shaped part names), optimiser names carry the note;
        3D part info shows it with the cut length.
      - Rule UI: construction methods (Joinery card), job + room properties ("Shaped Cabinets").
      - Tests `angledJoints.test.ts`: for both rules × trapezoid / angled end (both hands) /
        clipped / diagonal, with every front end set flush, the panels fill the band between
        outline and inside exactly (inside the outline, no overlaps, areas add up); square
        default stays inside + no overlaps; bevel angles for butt + mitre; flush toggle.
      - **Doors clear angled sides** (Mark's check, 2026-10-14: the facet door's edge sat past the
        cabinet's outside on the angled side). resolveShapedFace: a door end next to a panel / open
        edge runs along the facet until its outermost corner (the front face leans out past an angled
        side) is the reveal inside that edge's outer plane; square corners unchanged. Test
        `facetDoorClear.test.ts` (clipped both hands, trapezoid, angled end).
      - **Square-fronted sides come forward to the facet door** (Mark, 2026-10-14: the side sat a
        long way back from the door). With a door on the angled front, a square end runs past the
        clip vertex until both its corners are FACBUF clear of the door's end face
        (`facetDoorRun` in resolveShapedFace gives the door's start along the facet); the outer
        corner may pass the outline, beside the door. 45° clip on a 580 deep cabinet: 280 → 291.5.
- [x] 4a in-app check (Mark, 2026-10-14: "looks better" after the door + side fixes)
- Known gaps (4a): no CNC bevel or fixing drilling at angled joints (per-edge panels have no
  seams yet; hand-fixed); edge-tape strips in 3D still drawn on the square blank; the Part
  Editor shows a bevelled panel as its blank rectangle.
- [x] 4b — toe kick follows the shape (2026-10-14), `resolveShapedKick.ts` (hooked in resolveToekick
      after the none / wall check; kick runs unchanged):
      - Kick outline K = footprint pushed in by TOESCF (front / open), TOESCB (back), TOESCL / TOESCR
        (side on x = 0 / x = DX), 0 (other sides). Arcs are kicked along their chord.
      - Every front edge: kick face (TF) + sub front (TI, lifted TOEFC) in the zone-like frame
        (+X along the edge to the right seen from the front, +Z out, AY about the min corner); front
        neighbours **mitred** (decision 13), other ends square inside K. Leg type = faces only.
      - Back edges: kick back (TI), butted (earlier edge runs through). Side edges: end spreader
        along the edge (turned) + brace; internal spreaders at TOESP centres across the width,
        front-to-back, cut square to fit inside the band (kept clear of end spreaders + braces).
      - Blank + `bevel_lo/bevel_hi` (+ = back face shorter) on toekick_parts (migration_s4b, applied);
        persist + reload. `jointDrilling`: `tkBoxLocal / tkBevelOutline / tkPlanCorners / tkBoxAABB /
        tkBevelNote`. 3D turns (`tkRot`) + extrudes mitres; plan + plan report now draw the kick on
        shaped cabinets; elevation / top / side / Part Editor reference boxes use the turned bounds;
        cut list, Parts list, optimiser names carry "mitre 22.5°".
      - Tests `shapedKick.test.ts`: a rectangle-shaped footprint gives exactly the box kick; six
        presets: every kick part inside the footprint, no collisions at the same height; clipped
        corner faces share both mitre corners, set back TOESCF from the facet; leg = faces only.
- [x] 4b in-app check (Mark, 2026-10-15: "BC-15's kick looks good")
- Known gaps (4b): a shaped cabinet in a joined kick run still gets the run's straight kick;
  elevations show turned kick boards at their bounding width (true width = Phase 5).
- [~] 4c — benchtop auto-outline from shaped cabinets (built 2026-10-15)
      - `src/lib/benchtopSeed.ts`: `cabinetSeedOutline` (footprint or box, fronts pushed out
        via `insetPolygon` with −overhang), `unionOutlines` (split at crossings, drop pieces
        inside another outline / shared seams, chain, largest loop), `benchtopSeedFromCabinets`
        (back / scribe edges and edges on a wall face → wall edges; collinear runs merged),
        `btFrontOverhang` (decision 16). `loadRoomHandleSchedule` exported from loadCabinetInput.
      - CanvasClient `drawBenchtopInShapeEditor`: base cabinets of the selection (else all
        selected) → seed outline; falls back to the old bbox if nothing merges.
        `openNewInShapeEditor` takes a ready outline.
      - Tests `benchtopSeed.test.ts`: straight run, clipped corner facet out 40, L across two
        walls, overhang pick.
      - Not done: sides stay flush with the carcase (no end overhang); arcs come through as
        short straight runs; the panel's "Overhang past cabinets" still reads the box depth.
- [ ] 4c in-app check

### Phase L — L corner / pie (`BCNP`) `[~]`
Decision 15. Split L1 (shape + library) / L2 (bi-fold doors), in-app check each.
- [x] L1 — (2026-10-15)
      - Preset `l_corner` (presets.ts): edges back, end, front (back-wall leg, primary —
        first of the equal-length fronts), front2 (return leg), end2, back2. `side` = the end
        away from the room corner, as the diagonal corner.
      - `PresetParamDef.classDepth`: params seeded from the cascaded class depth at placement —
        `seedClassDepthParams` in `buildInstanceFromDefinition` (canvasDB), so it covers library
        placement and Replace. Runs even when the box depth is preserved (900 × 900).
      - **Inside-corner doors** (resolveShapedFace `concaveRev`): overlay doors on two facets
        meeting at a concave corner shared a ft × ft block. The primary (else earlier) facet's
        door runs long — its end GAPC/2 past the other door's back face — and the other stops
        GAPC/2 clear of its front face. Inset doors keep the plain GAPC/4 gap.
        Test `lCorner.test.ts` (both hands; fails on the old gap).
      - Library row `BCNP` (migration_l1_bcnp_library.sql, applied): class `base`,
        preserve_dz, copied from B2D. Primary door hinged right on `end`; front2's default
        facet door hinges on `end2`. Left-hand version: flip `side` in the Shape section and set
        the primary door's hinge to left by hand (until L2 picks hinges itself).
- [x] L1 in-app check #1 (Mark, 2026-10-15: "not bad for the first try") → fixes, same day:
      - **Pie-corner doors**: both stop door t + 2 back from the doors' inside corner (where
        their back planes meet, FACBUF out from the carcass corner) — each end 2 clear of the
        other door's face. Replaces the "one runs long" first cut. `PIE_CORNER_GAP`.
      - **Rails at the inside corner**: the earlier facet's `rail:<edge>` runs through past the
        corner by the other rail's plan depth; the later one butts against it.
      - **Rule `RAIL_ORIENT`** `vertical` | `horizontal` (default — Mark changed it 2026-10-15), every top rail
        incl. plain boxes. Upright rail: DX = RD (its height), DY = length, DZ = thickness,
        `upright: true` → caseBox maps it like a back panel (w = DY, h = DX, d = DZ); the seam
        frame then lays rail-to-side holes up its height. Front rail face flush with the carcass
        front, back rail on the top's back line. `case_parts.upright` (migration_l1b, applied);
        persist + reload; optimiser frame; ortho/plan/3D treat it as standing. Rule UI in
        construction methods, job + room properties. Finger-pull top rail push reads its height.
        **Changes every existing cabinet's rails on its next resolve.**
        Per cabinet: "Rails" select under Top Type in CabinetPanel (rule_overrides.RAIL_ORIENT, shown unless full top / none). BCNP library row + placed copies set to vertical (Mark: "all corner cabinets are vertical rails"; so no knock-in block at the pie corner).
      - **Shelf pin rows follow the panel** (`sharedDepth` in jointDrilling — seam frame + full
        bank): rows lay out along the Z overlap of shelf and panel, not the shelf's bbox depth.
        Plain boxes unchanged (test).
- [ ] L1 in-app check #2
- [x] L3 — construction drilling on per-edge panels (Mark, 2026-10-15: "drill holes are not
      making it onto some parts"; built same day). Carcass seams existed only between legacy box
      parts. Now `resolver/shapedSeams.ts` `enumerateShapedSeams` (pure; resolver + canvasDB
      reload): for every standing panel B (side / back / upright rail) square to the cabinet,
      in a frame turned so B faces ±X, a part whose end sits on B's face, overlapping it in
      height and depth, is a seam. Pairs: bottom / top / rail / back → side; side / back → back;
      rail → upright rail (flat rails at a pie corner are hand-fixed). Per-edge backs on the
      bottom = the turned back:bottom seam. Shelves on `side:` panels (per shelf or full bank).
      Plain boxes: none (legacy list untouched).
      - Key `part_a|part_b` (part keys hold colons); `ResolvedSeamJoint.shaped` = { turn, kind,
        side }. Joint cascade: per-cabinet entry → CM default of the legacy seam it plays
        (`bottom:left_side`, `front_rail:right_side`, `back:left_side`, `back:bottom`,
        `adj_shelf:side`…, picked by side).
      - Drilling (`jointDrilling.shapedSeamDrillOps` / `seamDrillsFor`): parts' plan AABBs in the
        turned frame (`partPlan / turnedBox / panelTurn / squareIn`), the legacy X-normal code,
        holes turned back (`turnDrill`). 3D draws a turned panel's holes in its own frame
        (`intoPartFrame`); CNC sync turns them into the panel (`intoPanel`); through-bore
        coalescing measures turned panels on their plan AABB (`seamExtentBoxes`). Part joint
        panel lists shaped seams for per-cabinet override (`getSeamAssignState` takes the
        generic key).
      - **Fix found on the way**: with BOTTOM_BACK_JOIN back_on_bottom the shaped bottom stopped
        at the backs' inner faces — backs floated 18 up over nothing. It now runs under the
        backs to the outline (sides still inset).
      - Which back / rail runs through at a corner follows the edge order, so it differs by hand.
      - Tests `shapedSeams.test.ts`: seam set both hands; every hole (real shop recipes) enters
        its part through a face and bores into it, both hands × both rail orientations; end2
        holes stay within its 560; plain box unchanged.
      - Angled panels (any angle) now get their seams — z_angled_filler A5 (2026-10-15): parts must meet
        them square (end-on / an edge along the face); angled butts + mitres stay hand-fixed.
      - Not done: angled butt / mitre joints; flat-rail pie-corner joint; 3D seam reference planes
        for shaped seams (holes draw, the green/blue joint plane doesn't).
- [x] L3 in-app check (Mark, 2026-10-15: "carcase drilling looks good"). Follow-ups same day:
      - Shelf pins on the backs: on a multi-back cabinet (L) both backs are shelf supports too
        (`shapedSeams` shelf loop), seams `int_adj_shelf_N|back` / `|back:back2`, inheriting
        their own CM key `adj_shelf:back` (CM builder "Back supports"), falling back to
        `adj_shelf:side`; overridable per cabinet. Shop default = "Adjustable Shelf Holes x1 Row
        (centre)": one row at D / 2 of the shared edge (`migration_l3b_adj_shelf_back_joint.sql`).
      - Through top rail: at the pie corner the earlier facet's rail now runs on across the other
        leg to the inset outline (other leg's back less back.t / scribe), not just past the corner
        by one rail depth (`resolveShapedCase` runOn). New seam rail → back (`rail:front|back:back2`
        right hand, `rail:front2|back` left), CM default from `front_rail:<side>`.
- [x] L4 — finger-pull backing rails on shaped cabinets (Mark, 2026-10-15: "the gables don't
      get checked out nor set back to allow for backing rail"). `resolveShapedFingerRails.ts`:
      - Per front facet, heights as the box (RAILH / RAILUP / gap, clamped to the carcass), along the
        facet line, front face on it, through the end panel to its outer face.
      - Pie corner: the earlier facet's rail runs on by the other's thickness, the later butts (same
        order as the top rails).
      - End panels notched at the front edge (box side → side frame; turned side:<edge> → face frame;
        3D now draws resolver outlines on turned side:/back: panels).
      - A rail at the carcass top pushes that facet's top rail back by its thickness; the top rail
        butting it at the pie corner grows to meet it.
      - CNC (seamDrillSync, fprail.shaped): knock-in block hole at each end that sits in a panel;
        notch + closed-end reliefs as pockets projected into each panel's own frame.
      - Not done: no block / fixing where the two rails meet at the pie corner; dividers.
      - Tests `lCornerFingerRails.test.ts`. In-app check pending.
- [x] L5 — placement + sharknose fixes (Mark, 2026-10-15):
      - Cabinets on other walls block placement by their real plan outline (`src/lib/cabinetObstacles.ts`
        crossWallCabinetOccupancy, appended in CanvasClient `wfOcc` → plan + elevation place / drag /
        stretch / paste, and useCabinetOps add-neighbour). Applies to every corner, not just shaped ones.
        Not in the CabinetPanel typed-position inputs. Tests `cabinetObstacles.test.ts`.
      - Sharknose profile now draws on turned facet doors (handleGeometry.sharknoseProfile).
- [ ] L2 — bi-fold pair (research 2026-10-15): Blum CLIP top 60° bi-fold **79T8500** (screw-on) /
      **79T8530** (knock-in), only with CLIP top 170° (71T6550 / 71T6580) or 155°. **Lead door**
      carries every cup: 170° cups on its outer edge to its end panel, bi-fold cups on its pie
      edge at **12.5 mm** cup centre (partial bore). **Trailing door**: no cups — the bi-fold's
      plate screws to its back face; nothing on the carcass at the inside corner. Gap adjusts
      +7.2 / −4.2. No soft-close built in (add-on 970.1002). Lincoln Sentry lists 79T850/853 as
      discontinued. Mark's answers (2026-10-15): trailing-door plate holes **37 mm from the door
      edge**; **either leg's door can lead** — the resolver infers it from the face grid hinge
      sides (door hinged toward its end panel = lead, door hinged toward the pie corner =
      trailing); **2 hinges per base door**, 170° and bi-fold hinges to be created in the hardware
      library. Then rhk-crm `BCNP` + `pie` corner kind, both skill copies.
      Order: L3 drilling first, then L2.
      - L2a done 2026-10-15: Mark uses **INSERTA 170° (71T6580)** + **knock-in bi-fold (79T8530)**.
        Both added to `hardware_hinges` ("Blum 170 INSERTA", "Blum 60 bi-fold knock-in", cup X 12.5;
        `migration_l2a_bifold_hinges.sql`). Dowel/anchor pattern copied from Blum 110 (45/9.5) — confirm
        against Blum's template. The table has no plate-hole fields yet; the trailing door's 37 mm plate
        holes are in the row's notes until L2 adds them.
      - Shelf pins on the L shelf's second leg (Mark, 2026-10-15): both end panels drill since L3
        (resolver test confirms 2 holes on each end, inside each shelf leg).

### Phase 5 — Output `[ ]`
> Nest / CNC of true shapes is tracked in `z_part_shape_editor/OPTIMISER-PHASE-PLAN.md`
> (O2b resolver outlines → O3 sheet preview → O4 contour G-code → O5 EB deduction), 2026-10-15.
- [ ] Elevations at true width (decision 3)
- [ ] Cut list / optimiser / CNC: bevel edges and angled cuts
- [ ] Reports

### Phase 6 — Free-form + recognition `[ ]`
- [ ] Shape Editor on cabinet footprint with role picker (`edgeOptions`), neighbours/walls as `referenceOutlines`
- [ ] Classifier (S-e)

---

## Touchpoints (from code map, 2026-10-11)

- Box assumption: `src/lib/geometry.ts:340-366` (`cabinetPolygon`), `ElevationSVG.tsx` span `[cabT, cabT+dx]`, `Room3DScene.tsx` fallback box
- Resolver: `src/lib/resolver/resolveCase.ts` (axis-aligned, AX/AY/AZ = 0), `resolveFace.ts` (single face)
- `*_corner` classes are labels only; `_corner` stripped in `resolveClassDims.ts:52`, `loadCabinetInput.ts:408`
- Neighbour reveals: left/right only (`left_/right_neighbour_type`)
- Custom parts have no free rotation (view-only `part_pos_overrides`) — Phase 2 must give angled panels real rotation that reaches the optimiser

## Plan handedness (fixed 2026-10-13)

Back-side cabinets were drawn **mirrored** in plan: local X always ran along the
wall direction from `pos_x/pos_y`, while 3D (Room3DScene `needTurn`) and the back
elevation turn the cabinet 180°. Asymmetric footprints therefore showed opposite
ways round in plan vs 3D. Locked: the cabinet's own frame is a **rotation, never a
mirror** in every view. `cabinetPlanFrame()` / `cabinetToPlan()` in
`src/lib/geometry.ts` turn the frame (origin at the span's far end, +X back along
the wall) whenever `(wallDir, perp)` is left-handed; CanvasSVG + PlanViewReportSVG
part outlines, shaped footprints, door swings / hinge sides and drawer lines all
route through it. `pos_x/pos_y` keeps its wall-space meaning (wall-start end).
