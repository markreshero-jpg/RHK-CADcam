# Shaped Cabinets — Spec & Phase Tracker

> **Purpose**: the living spec for non-rectangular ("shaped") cabinets —
> clipped/angled corners, diagonal corners, angled ends, radius ends, and
> cabinets with more than one front face. Survives chat wipes — update status
> lines and decisions in the same change as the code.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → Phases 1–2 checked in-app (Mark, 2026-10-12), uncommitted.
> Next: Phase 3
> (faces per front edge).

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

### Phase 3 — Multi-facet faces `[ ]`
- [ ] `faces` map per front edge (S-c); FaceGridEditor picks a facet
- [ ] Facet-to-facet junction: reveal / mitre / post
- [ ] Hinges + drawer depth clearance per facet

### Phase 4 — Angled joints, toe kick, benchtop `[ ]`
- [ ] Joint chooser from dihedral angle + roles (mitre / bevel / butt), thickness compensation
- [ ] Toe kick follows front edges
- [ ] Benchtop auto-outline from shaped cabinets

### Phase 5 — Output `[ ]`
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
