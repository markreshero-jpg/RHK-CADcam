# Shaped Cabinets — Spec & Phase Tracker

> **Purpose**: the living spec for non-rectangular ("shaped") cabinets —
> clipped/angled corners, diagonal corners, angled ends, radius ends, and
> cabinets with more than one front face. Survives chat wipes — update status
> lines and decisions in the same change as the code.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** → Phase 0 (this spec) written 2026-10-11. Next: Phase 1
> (footprint data model + presets + plan render). Nothing built yet.

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

## Proposals (not yet locked)

- **S-a Storage** — `footprint jsonb` on `cabinet_instances` and
  `cabinet_definitions`:
  ```jsonc
  {
    "preset": "clipped_corner",          // null = free-form
    "params": { "clip_x": 300, "clip_z": 300, "side": "right" },
    "segments": [                        // Shape Editor format, cabinet frame
      // origin bottom-left-back, x → right, z → front (CABINET-GEOMETRY-SPEC)
      { "type": "line", "start": [0,0], "end": [900,0],
        "edge": { "id": "e0", "role": "back" } },
      ...
    ],
    "role_overrides": { "e3": "open" }   // user overrides survive regeneration
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

Codes: confirm with the `cabinet-codes` convention before seeding.

---

## Phases

### Phase 0 — Spec `[x]` (2026-10-11)

### Phase 1 — Footprint data + presets + plan `[ ]`
- [ ] Migration: `footprint jsonb` on instances + definitions (S-a)
- [ ] Types + preset generators (`src/lib/cabinetShape/presets.ts`), formula-driven (S-d)
- [ ] `cabinetPolygon` in `src/lib/geometry.ts` returns the footprint when present
- [ ] Plan render of shaped outline, registered through the display-layer API
- [ ] Library: preset cabinets placeable from the library; preset param panel

### Phase 2 — Case resolver `[ ]`
- [ ] Per-edge panel generator (own frame, non-zero AY rotation)
- [ ] Horizontals = inward offset of footprint (bottom, top / rails)
- [ ] Butt joints at every vertex first; 3D render (Cabinet3DView / Room3DScene)
- [ ] Part-shape outlines on non-rectangular horizontals (reuse `part_shape_overrides` render path)

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
