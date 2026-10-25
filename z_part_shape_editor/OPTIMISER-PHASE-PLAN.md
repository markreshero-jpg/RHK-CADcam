# Shapes → Optimiser Phase — Plan & Milestone Tracker

> **Purpose**: survives chat wipes — update status lines as work lands (same convention as
> `INTEGRATION-PLAN.md`, which covered the authoring phase M1–M8, closed 2026-08-02).
> Goal (Mark's locked end goal, 2026-07-30): **shaped and resized parts actually get cut** —
> the optimiser, G-code and paper all stop pretending every part is its base rectangle.
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
>
> **RESUME HERE** (2026-10-15) → restarted for shaped cabinets (Mark: "when will the nest pick up
> the true shape of corner cabinets, radius cabinets etc."). Agreed order: **O2b** (resolver
> outlines into the snapshot) → **O3** (sheet preview) → O4 (contour G-code) → O5 (EB deduction).
> True-polygon / NFP nesting stays deferred (locked decision #2: nest at bbox, cut the contour).
> **2026-10-16: O2b + O3 + O4 built** (uncommitted until Mark's in-app check). Test job: RHK6581 The
> Hive Co (BC-09 L corner + radius end, BC-15 clipped corner, BC-07/08 angled fillers, notched
> finger-pull gables on most base cabinets). Next after the check: O5 (EB deduction on inner
> shaped edges).
> **2026-10-16: true arcs built** (uncommitted, check on RHK6581 BC-21 radius end — Mark: "this
> should be a radius, one continuous curve"; machine Anderson Genesis Plus 49, Fanuc → G2/G3 on by
> default, no profile toggle). See O4 "True arcs" below. **Checked in-app by Mark 2026-10-18** ("arcs on
> cabinet work well").
> **2026-10-18: O5 built** (EB deduction on shaped contours — see O5). In-app check pending: a
> deducting profile on RHK6581 — BC-09's L bottom should nest 1 tape smaller on its fronts / ends only.
> **2026-10-20: O6 built** (paper cut lists read sizes like Stage 2 — see O6). Next: O7.
> **2026-10-25: O7 built** (Edgeband Length report in Room / Job Reports — see O7). In-app check pending.
> All O-milestones now built; open items = Mark's in-app checks (O2b, O3, O5, O6, O7).

---

## Locked decisions (agreed with Mark, 2026-08-02)

1. **Override application is OPTIMISER-SIDE**: `normalize.ts` (and the cut-list report) load
   `part_pos_overrides` + `part_shape_overrides` and adjust part sizes at snapshot time.
   `persistResolved` and the resolved part tables stay pure resolver output — nothing is baked
   into the DB. (Resolver-side baking rejected: double-apply risk in every view-layer consumer.)
2. **Nesting footprint = bounding box** this phase. Shaped parts occupy their bbox rect in the
   skyline packer; the contour is still CUT. True polygon/NFP nesting stays deferred.
3. **Edgeband deduction applies to shaped parts too** (Mark: "if the shaped edge has edgebanding
   applied to it then it needs to be deducted off the part"). Banded segments of a shaped outline
   are offset inward by tape thickness when the machine profile deducts — NOT skipped. This is
   the hard-geometry milestone (O5).
4. **Phase scope beyond nest+contour**: cut-list report fix, optimiser shape preview
   (Stage 4/5 outlines + `nest_placements.shape_polygon`), edgeband length/metres report. All in.

## Verified pipeline facts (explored 2026-08-02)

- **Optimiser is a one-way snapshot**: `/projects/[projectId]/optimiser` server loader
  (`page.tsx:29-36`) + client batch loader (`loadClient.ts:29-36`) SELECT the six part tables
  (`case_parts, internal_parts, toekick_parts, face_zones, drawer_box_parts, cabinet_custom_parts`);
  `normalize.ts:121` takes `w=dx, h=dy, thk=dz` raw. Never calls the resolver, never reads
  `part_pos_overrides` (confirmed: zero references under `src/lib/optimiser` or the optimiser route)
  or `part_shape_overrides` (zero references outside canvas UI).
- **Nester**: hand-written skyline rect packer, `src/lib/optimiser/nest.ts` (random-restart,
  offcut pool, grain lock, top-left mirror). "Arbitrary-polygon NFP packing is a future
  extension" — `nest.ts:11-13`.
- **G-code**: `src/lib/optimiser/gcode.ts` — order: drills → circular pockets → routes/grooves →
  perimeter. The perimeter cut IS the sizing cut; `routePerimeter` (`gcode.ts:725`) hard-codes
  4 corners from `pl.x/y/w/h`. Onion-skin two-phase, cutter comp, ramp/lead arcs, tabs.
- **EB deduction today**: per-part `eb_w1/w2/h1/h2` computed in `normalize.ts` (`ebFields:26-36`,
  per-table mappings :148-234), applied by `cutSize()` (`types.ts:93-96`) when profile
  `deduct_edgeband` — nest dims (`OptimiserClient.tsx:648`) AND op re-registration
  (`drills.ts:82-93 ebShift`, shifts ops when left/bottom edges shrink).
- **Stage 6 write-back**: `nest_jobs/nest_sheets/nest_placements` (`Stage6Gcode.tsx:178-208`);
  `nest_placements.shape_polygon` exists in schema, hard-coded `null` (`:203`).
- **Stable part ids** (what overrides/shapes key by): `case_<part_key>` /
  `tk_<part_key>_<sort_order>` / `int_<part_type>_<sort_order>` / `zone_<row>_<col>` /
  `custom_<uuid>` — reconstructable from the selected row columns; MUST match
  `Cabinet3DView.tsx` id building exactly (~155–237).
- **Override slots are per-kind box extents**, not raw dx/dy: side→`sd/sh`, horizontal→`sw/sd`,
  face→`sw/sh` (`displayExtents` in `partEditorCore.ts`; custom parts write `dx/dy` directly on
  their row so they're ALREADY correct in the optimiser). Shape saves stamp `meta.sizeSlots` +
  `meta.baseAtSave` — reuse, don't re-derive.
- **Stale-shape machinery exists**: `shapeIsStale` (OverridesView) compares base pair vs
  `baseAtSave` (0.5mm tol, unordered).
- **Edgeband metres reporting doesn't exist anywhere**; `edge_banding.cost_per_metre` is an
  unconsumed library column. Shape meta stores `tapeLengthMM` at save.
- **Mirror/two-sided**: everything emits on the single existing pass; `plane_kind` loaded but
  unused (two-sided machining is Phase B of the door-faces track, separate). Shaped contours
  must go through the SAME part→sheet transform as drills so mirrored parts (right gables) cut
  on the correct physical edge.
- **Known pre-existing fragilities (NOT this phase)**: `OptiPart.uid = table:row.id` dangles
  after every re-resolve (saved `nest_placements` point at dead rows); `output_to_cnc` /
  `nest_priority` reset to defaults on every resolve; no reload-a-saved-run path.

---

## Milestones

### O1 — Effective part sizes in the snapshot (the override gap)
**Status: [x] done (2026-08-02) — verified headlessly (z_plan_automation/verify-o1.mjs: BC-13 front_rail sw=927 override → Stage 2 row shows 927 with the ● marker; PASS).** New `src/lib/optimiser/sizeOverrides.ts`: `boxAxes()` inverts the svg*Meta box→row mapping per part kind (case side/back/horiz, tk spreader_horizontal split, int side/face/horiz kinds, db side/bottom/face, face_zones direct); `applySizeOverride` folds sw/sh/sd into a row COPY's dx/dy/dz. normalize.ts applies it per-loop BEFORE EB fields + tk canonicalisation (so deductions/canonical sort see effective dims); OptiPart gains `size_overridden` + `base_w/h/thickness`. Both loaders select `part_pos_overrides`. Stage 2 dims cells: sky ● on changed axes with "base → effective" tooltip. Thickness overrides shift the material group automatically (group key already uses thickness).
- New shared module `src/lib/optimiser/effectiveSize.ts` (or in `normalize.ts`): reconstruct the
  stable part id per row, look up `part_pos_overrides[cabinet].sizeSlots`, map per-kind slots →
  the row's dx/dy/dz axes (reuse/mirror `displayExtents` logic — do NOT re-derive), produce
  effective `w/h/thickness`. Custom parts: dims already authoritative on the row — no change.
- Load `part_pos_overrides` in BOTH loaders (`page.tsx` already selects `cabinet_instances` —
  add the column; `loadClient.ts` same).
- Stage 2 parts table: overridden sizes shown with a marker (tooltip: base → effective).
- Thickness overrides (`sd` on faces etc.) change the material-group key — let them (a 25mm
  gable override should NOT nest with 16mm stock).
- **Accept**: hand-resized gable (sh=700) nests and lists at 700; unoverridden projects
  byte-identical snapshot; both load paths agree.

### O2 — Shapes into the snapshot
**Status: [x] done (2026-08-03) — verified headlessly (verify-o2.mjs PASS: fresh ⬠ r3 on BC-09's gable, nestable; the STALE path also observed live — amber ⬠ with both sizes + excluded-from-nest banner — before the data was healed).** New `src/lib/optimiser/shapes.ts`: SHAPE_SELECT/buildShapesByCab (latest revision per part, both loaders query it) + `attachShape` (samples the polygon via shapePath, bbox from TRUE geometry, stale = unordered pair vs effective in-plane dims, 0.5mm tol). OptiPart gains `shape` (segments/polygon/bbox/tape_mm/revision) + `shape_stale`. Stage 2: ⬠ marker (sky fresh w/ revision, amber stale w/ both sizes). Stage 4: stale shapes excluded with reason; **interim safety: shaped parts nest at FULL bbox even when the profile deducts EB** (deducted rect < contour would let the packer overlap material — lifted by O5), amber note lists shaped+banded parts. Known cosmetic gap for O5: Stage 2 dims display still shows cutSize for shaped parts when deduct is on (724 vs the 725 it nests/cuts at).
**Bug found & fixed en route (ShapeEditor.jsx)**: `shapeBoundsMM` + `checkGeometry` computed bounds from segment ENDPOINTS only — an arc bulging past its chord (BC-09's grow-wider gable, drawn during the M7 verify) reported maxX=560 while the true outline reached 725: the "wider than part" warning stayed silent and the bbox→size write was skipped, leaving shape/part inconsistent (exactly what O2's stale flag caught). New `segSamplePoints` (W3C arc sampling ~10° + 12-step cubics) feeds all three consumers (save meta.bounds, datum panel, re-reference). Save-flow re-verified end-to-end (verify-o2b.mjs: r3 + `sd:725` override written).
- Load `part_shape_overrides` (latest revision per part — same query shape as
  `dbLoadShapeOverrides`) in both loaders; attach to `OptiPart`: `shape?: { segments, polygon
  (sampled via src/lib/shapePath.ts), bbox, tapeLengthMM }`.
- Nest footprint = shape bbox (locked decision #2) — should equal the O1 effective size; if they
  disagree beyond tolerance → the shape is STALE: amber warning on the part in Stage 2 and
  exclude-from-nest with an explicit reason (never silently cut a stale shape — matches the
  authoring phase's "keep shape, flag error" policy).
- **Accept**: shaped gable appears in Stage 2 flagged as shaped, nests at bbox; stale shape
  blocks that part with a visible reason; rect-only projects unchanged.

### O2b — Shaped-cabinet outlines into the snapshot (added 2026-10-15)
**Status: [x] built 2026-10-16 — in-app check pending.** `shapes.ts`: `shapeFrameFor(table, typeKey,
partId)` (swap / mirror per kind, mirrors Cabinet3DView panelKind + PartEditor), `shapeToOpFrame`,
`outlineToSegments`; `attachShape` takes the op frame + the row's `outline` → `OptiShape.source`
`'drawn' | 'resolver'` + `op_polygon` (op frame: bottom-left, y up, x along w, y along h).
normalize.ts: op frame = DX × DY; `transpose` when the part nests turned (vertical-grain fprail,
toe-kick canonical sort); on-edge kick spreaders (nest face ≠ DX × DY) get no op outline.
Custom parts now select `orientation`. Decisions made in the build:
- Resolver outlines are **never mirrored** (written unmirrored on both gables) and never stale; one
  that no longer fits the part (hand sw/sh override) is **dropped** → plain rectangle, as before.
- `nestsFullSize(p)` = drawn shapes only. Resolver shapes keep the ordinary cut-size nest while
  they still CUT as the rectangle (until O4) — otherwise every finger-pull gable would lose its
  EB deduction. Benchtop pieces count as drawn (they always nested full size).
- Bug fixed en route: sheetDrills shifted holes for EB deduction on drawn-shape parts that nest at
  full size (holes ~tape thickness off) — now `deduct && !nestsFullSize`.
- Side bug (A) fixed: PartEditor flips a right-hand side's resolver outline into its mirrored
  display frame (notch showed at the back; saving it unedited moved it there).
- Stage 2: "⬠ auto" for resolver shapes.
Tests `__tests__/shapeOpFrame.test.ts`: frame per kind, transform, drawn-wins / no-mirror / drop /
transpose; end to end through normalizeProject on a resolved BCNP, both hands: the bottom's L
matches the plan footprint on a grid, and every finger-rail notch pocket lands in the cut-away
while every drill on that panel lands on material (box gable + turned `side:end2`).
Shaped cabinets (z_cabinet_shape: L / diagonal / clipped corners, radius ends, angled fillers…)
write a resolver outline on their non-rectangular horizontals — `case_parts.outline` (bottom,
full_top, rails) and `internal_parts.outline` (shelves) — in the horizontal Shape Editor frame
(x across from the part's X, y down from its front edge; the Part Editor already shows it and
seeds the Shape Editor with it, z_cabinet_shape 3c). Today the optimiser never reads it, so those
parts nest AND cut as their bounding rectangle.
- Both loaders select the `outline` columns; `normalize.ts` turns an outline into a shape for the
  part (closed line loop) when the part has **no drawn shape** (a drawn shape wins — same rule as
  the renderers). `OptiShape.source`: `'drawn' | 'resolver'`; a resolver shape is never stale
  (it is regenerated with the part).
- **Frame**: settle once which shape axis is the part's `w` (dx) / `h` (dy) per part kind, for
  drawn AND resolver shapes (attachShape's unordered-pair compare sidestepped it; O3/O4 can't).
  Pin it in `shapes.ts` with a test per kind — a near-square L-corner bottom makes "match by size" ambiguous.
- Stage 2: ⬠ marker reads "auto" for resolver shapes.
- **Frame findings (code sweep 2026-10-15 — use these, don't re-derive):**
  - Optimiser part: `w = DX`, `h = DY` (normalize.ts ~132). Op frame = origin bottom-left, y UP,
    `pos_x` along w, `pos_y` along h (partFootprint.ts header; partEditorCore PLANE_EDGES). Sheet:
    `drills.ts toSheet` — `rotated ? (pl.x + pl.w − oy, pl.y + ox) : (pl.x + ox, pl.y + oy)`, plus
    `ebShift`. No op mirror at sheet time; machine datum / mirror_y applied later in gcode.ts mapX/mapY.
  - Shapes (drawn AND resolver outlines) are stored in the Part Editor's **display frame, y-down**
    (PartEditor.tsx ~249: `swap = panelKind !== 'side' && !dxIsWidth`, `mirror = side && id has right_side`).
    Shape → op: **no swap** `pos_x = sx` (or `DX − sx` mirrored), `pos_y = DY − sy`;
    **swap** `pos_x = DX − sy`, `pos_y = sx` (transpose + flip). Proof the frames agree: usePartOps.ts ~157-171.
  - Per kind: **swap** = bottom / full_top / flat rails / shelves (sy = 0 is the FRONT; shape origin =
    front-left), back + `side:`/`back:` panels (sy = 0 = top), drawer-box front/back/bottom, custom flat,
    kick boards, tk horizontal spreader. **No swap** = gables (left from the back; right_side
    mirrored = from the front), dividers, face zones / doors (`dxIsWidth`), custom side/front,
    tk vertical spreader. Resolver horizontal outline matches the swap rule exactly
    (resolveShapedCase clipHorizontal: `{ x: q.x − b.x0, y: b.y1 − q.y }`).
  - **Exceptions**: toe-kick dims are sorted by `canonicalPanelDims` (w = longest), so kick
    boards are transposed against DX/DY; vertical-grain finger rails are turned (w = DY, h = DX).
  - Nothing converts shape → op frame yet; `benchtopParts.ts shapeFor` is the only precedent.
    Write ONE `shapeToOpFrame(shape, kind/swap/mirror, DX, DY)` in shapes.ts and use it for O3 + O4.
  - Side bugs found (not O2b; log/fix separately): (A) right_side resolver finger-rail notch outline is
    stored unmirrored but the Part Editor mirrors every right_side shape — the notch shows at the wrong
    edge and saving it unedited flips it; (B) toe-kick hand ops likely transposed on the sheet;
    (C) upright rails: sizeOverrides.boxAxes ignores `upright` (shape sh → dz) and svgCaseMeta labels
    them horizontal; (D) custom-part hand ops keyed `cabinet_custom_parts` vs normalize's
    `custom_parts` — probably never reach the sheet; (E) drawer-box side/bottom: Part Editor vs
    cabinet 3D disagree on which edge is the front for a drawn shape.
- Not in O2b: bevelled / mitred ends (still the blank + a note, sawn by hand — z_cabinet_shape Phase 5).
- **Accept**: an L-corner (BCNP) bottom, a radius-end shelf and a BFKANG bottom show ⬠ auto in
  Stage 2 with the right bbox; rect projects byte-identical.

### O3 — Shape preview on the sheet + persisted polygon
**Status: [x] built 2026-10-16 — in-app check pending.** `shapes.placedOutline(part, pl, deductEb)`
= op_polygon through the drill transform (drills.toSheet + the up-face ebShift on a deducted
blank), relative to the placement corner. `SheetSVG` (Stage 4, `outlineFor` prop + exported
`PlacedOutline`) and Stage 5 `InteractiveSheet` draw the bbox faint + dashed (still what packs /
drags) and the outline filled inside it; follows drag + rotate. Stage 6 writes
`nest_placements.shape_polygon` = **op_polygon** (part-local mm, origin bottom-left, **y up**,
finished size, pre-rotation — changed from the "y-down" first draft so it matches ops and the
sheet). Test: placedOutline == toSheet per point, plain + rotated; deducted shift resolver vs drawn.
- Stage 4/5 sheet SVGs (`SheetSVG.tsx`, `Stage5Edit.tsx`): draw the sampled outline inside the
  placement rect for shaped parts (rotation-aware; reuse shapePath sampling, don't re-tessellate
  per frame).
- Stage 6 save: write `nest_placements.shape_polygon` instead of `null`.
- **Accept**: shaped part visibly shaped in Stages 4/5 incl. after 90° rotation and manual move;
  saved run rows carry the polygon.

### O4 — Contour G-code
**Status: [x] built 2026-10-16 — in-app check pending (with O2b + O3).**
- `GcodeInput.outlines` (placement uid → outline in sheet coords); Stage 6 builds it per sheet from
  `placedOutline` + the placement corner, so G-code, sheet preview and holes share one transform.
- `routePerimeter` takes the outline: wound CCW (climb) / CW (conventional) like the rect, grown by
  the computer-comp radius, mapped, flip-wound for reflecting datums; the rect path generalised to
  N corners (longest-edge-midpoint start + front tie-break, ramp / lead-in / lead-out / onion skin /
  control comp unchanged). Outward normal now from the loop's winding (equal to the old
  centroid test on a rect; correct on concave outlines).
- **Rect output is byte-identical** (all existing G-code fixture tests pass; a rect outline in
  either winding posts the same program as no outline — 6 post setups).
- `shapes.toolPathLoop`: outer-profile offset that **drops recesses narrower than the bit** and
  re-joins the neighbours (else the offset crosses itself and gouges — proven: a plain offset
  gouges a finger-pull gable with a 12 / 16 mm bit). Dropped → `(WARN: … detail smaller than the
  Nmm bit - not cut there)` in the program. Finger-pull reliefs (RAILCUT 5 → 10 tall) fit a
  ≤ 10 mm bit exactly.
- Deducted blanks (decision made in the build): `placedOutline` pulls outline edges lying on the
  part's rectangle in by that side's tape, so a resolver contour fits the cut-size blank; inner
  edges (notch walls, angled facets) stay at finished size until O5. Drawn shapes still cut full size.
- Simulator 2D + 3D draw the outline (parts + carve mask); the toolpath comes from the G-code itself.
- Tests `__tests__/contourGcode.test.ts` (rect identity, L tool-centre corners incl. inside corner,
  never enters the missing quarter, climb CCW / conventional CW, start + waste-side ramp, validator
  clean) + gouge guard in `shapeOpFrame.test.ts` (6 / 10 / 12 / 16 mm bits on a resolved gable,
  path sampled every 0.5 mm stays ≥ r from the part and outside it).
- **True arcs (2026-10-16)**: resolver outlines store each footprint-arc edge as ONE edge — a DXF
  bulge `b` on its start point (`shapePath.OutlinePt`; read via `sampleOutline` / `outlineSegments`,
  never as bare points). `resolveShapedCase.clipHorizontal` clips the sampled inset as before, then
  `restoreArcs` swaps runs on a footprint circle back to one arc (ends snapped onto the circle along
  the clip line). Part Editor draws it as an SVG arc; 3D samples at 2°. Contour G-code: the final
  tool-centre loop (machine space, after EB + cutter offset + datum) goes through `fitLoopArcs` —
  ≥ 3 gentle (≤ 12°) same-way edges within 0.025 mm of one circle → one G2/G3 (I/J), so drawn
  shapes and benchtops get arcs too; a loop with no straight edge stays as flats. Start point =
  longest STRAIGHT edge. Simulator parser now replays G2/G3 along the arc (was a straight chord —
  lead-in arcs and helical entries too). Tests `__tests__/arcContour.test.ts`.
- Known gaps: inside corners keep
  the bit radius (unavoidable). Tabs still comment-only (as the rect). With `control` comp the
  machine applies the offset, so small reliefs rely on the controller.
- `routePerimeter` (or a sibling `routeContour`) takes the shape outline for shaped parts:
  segments → toolpath (lines + arcs as G2/G3 where the post supports them, sampled polyline
  fallback; beziers always sampled), cutter compensation side from loop winding, ramp/lead-in
  per existing profile settings, tabs distributed along the contour, onion-skin two-phase kept.
- Same part→sheet transform as drills (rotation + the mirror convention) — a right gable's
  notch must land on the same physical edge the Part Editor shows.
- Drills/routes on shaped parts: op coords are already op-frame-preserved (M3 re-anchoring) —
  verify against a shaped+drilled part rather than assuming.
- Simulator: contour renders in the toolpath sim (gcodeParser may need arc handling checked).
- **Accept**: generated program for a shaped gable cuts the drawn profile (verified in the
  simulator + coordinate spot-checks against the stored segments); rect parts emit identical
  G-code to before (regression-diff a saved program).

### O5 — Edgeband deduction on shaped contours (locked decision #3)
**Status: [x] built 2026-10-18 — in-app check pending.** One function, `shapes.cutBlank(part, deduct)`,
is the blank every consumer uses: nest dims + Stage 2 dims (OptimiserClient), the op shift
(sheetDrills → PartRef eb_w1 / eb_w2 / eb_h1 = the blank's sx / sx2 / sy, so ebShift is unchanged), and
the sheet / G-code contour (`placedOutline` = the blank's outline). Plain rectangles = cutSize as before.
- **Per-edge tape** (`OptiShape.op_tape`, one per op_polygon edge, from `attachShape`'s new `eb` arg =
  the part's tape thickness + edge flags, normalize `bandOf` per table): drawn shapes use each segment's
  `edge.band` tag (seeded from the rect banding); resolver outlines use a new per-edge **flag tag**
  `OutlinePt.e` ('top' | 'bottom' | 'left' | 'right' — shapePath `EdgeTag`, carried by mapOutline /
  reverseOutline). Untagged edges (old rows, finger-pull gables, benchtops) keep the O4 rule: the tape of
  the rectangle side they lie on, inner edges none.
- **Resolver tags** (`resolveShapedCase.tagEdges`, every clipped horizontal — bottom, full_top, rails,
  shelves): an arc or an edge on a footprint front → 'top' (front) whichever way it faces (a pie corner's
  second leg); an edge along a panel (within 45 mm) → 'bottom' for a back panel, else the end it stands at,
  left / right by which half of the cabinet the panel is in (the pie corner's end2 panel closes the side
  leg at the front and is still an end); anything else → the way it faces. Fixes the O4 rule on an L
  bottom: the side leg's wall edge was banded as the 'left' end and the leg-2 front not at all.
- **Offset**: `offsetLoop` per edge (arcs offset concentrically as their 5° chords); neighbours with
  different tapes that are parallel or **within 12° of tangent** step instead of mitring (a banded arc
  into an unbanded straight — the mitre would run ~t / sin θ along the straight). Blank = the offset
  loop's bbox; sx / sy = its min corner, sx2 = w − its max x.
- **Failure**: `insetClean` (winding kept, area shrinks, every point on the part, no non-neighbour edges
  crossing OR touching — a sliver narrower than its tapes folds onto itself) → `failed`: cut at finished
  size and the run warns, naming the parts (replaces the "contour EB not built yet" note).
- Tape missing on a banded shaped edge → `eb_missing` (existing warning).
- Blanks cached per part (WeakMap) — the sheet views ask per placement per frame.
- Tests `__tests__/contourEdgeband.test.ts`: rect = cutSize; drawn notch (banded top + notch wall +
  right) comes in by exactly the tape on those edges only; untagged → rectangle sides; banded arc at
  r − t, straights untouched; collapsing sliver fails; tape missing flagged; BCNP L bottom both hands
  (4 of 6 edges banded, every edge's midpoint moved by its tape lies on the blank, 882 → 881 × 881).
- Not done: benchtop shaped pieces still nest at their full outline (their segments carry no band tags —
  the benchtop track's call). Two-sided (pre-mirrored down-face) bores on shaped parts use sx2 like the
  rectangle; untested on a real down-face bore of a shaped part.
- When profile `deduct_edgeband` is on: offset each BANDED segment of the outline inward by its
  tape thickness (per-segment `edge.band` flags; tape thickness resolution reuses the
  `normalize.ts` matEb fallback chain). Adjacent-segment reconciliation: re-intersect
  neighbouring offset segments (line/line, line/arc, arc/arc); where no intersection exists
  (tangent/short segments) fall back to trimming + amber warning on the part.
- Bbox shrink from the offset feeds the nest dims; ops shift like `ebShift` does for rects —
  derive the shift from the offset of the datum-adjacent (left/bottom) banded segments.
- Unbanded segments untouched. Parts whose offset geometry fails: cut at drawn size + loud
  warning (never emit silently-wrong geometry).
- **Accept**: shaped part with a banded straight edge cuts smaller by exactly the tape
  thickness on that edge; banded arc offsets concentrically; rect parts' deduction output
  unchanged; failure cases warn visibly.

### O6 — Cut-list report fix
**Status: [x] built 2026-10-20 — in-app check pending.** New `src/lib/optimiser/cutListDims.ts`:
`cutListDims(table, part, cabinetId, sizeOv, shapes, ref)` = the resolved part's effective dims through
the SAME `applySizeOverride` (O1) and `attachShape` (O2 — drawn wins, stale flag, a resolver outline
that no longer fits is dropped) that normalize.ts uses; `shapeMark` → "⬠" / "⬠ auto" / "⬠ STALE".
- **Cabinet sheet** (`CabinetSheetSVG`): one `listedParts()` pass feeds the cut list and the OVERRIDES
  block. Cut rows use effective sizes + the ⬠ mark (mitred fronts: blank width from the effective DX).
  OVERRIDES now lists sw/sh/sd resizes as `L 720→700` / `W …` / `T …` and drawn shapes (`shape r3`, or
  `shape STALE — re-edit`). `CabinetSheetReport` loads `part_shape_overrides` for the visible cabinets.
- **Parts List Summary** (`ReportsModal`): same helper; loads `part_pos_overrides` + shapes for every
  cabinet in scope; now also lists **drawer box parts** (the sheet already did) and mitred fronts at their
  blank width; shaped-panel labels via `shapedPartLabel`.
- **Column fix (CV convention, locked 2026-08-16)**: both lists printed W = DY / L = DX (the sheet) and
  "Width = DY / Depth = DX" (the summary) — reversed. Now **L = DY, W = DX, T = DZ** (Length / Width on the
  summary), as PartsView and Stage 2.
- Test `__tests__/cutListDims.test.ts`: every case / internal / face part of a box cabinet (resized gable
  + door, fresh drawn shelf, stale drawn bottom) and of a BCNP (resolver outlines) — dims, overridden flag,
  shape source and stale flag equal normalizeProject's OptiPart.
- Not done: custom parts are still not in the Parts List Summary (the sheet lists them in OVERRIDES);
  toe-kick spreaders stay off the cabinet sheet (unchanged). Paper sizes are finished size (Stage 2 with
  deduction off) — no cut-size option on paper.
- `CabinetSheetSVG.tsx` cut rows (`:304-349`) + `ReportsModal.tsx` parts list (`collectParts
  :59-77`): apply the SAME effective-size module as O1 (shared import, not a copy); shaped
  parts marked (⬠ + bbox) and sw/sh/sd overrides finally listed in the OVERRIDES note block
  (today only ox/oy/oz/rot print).
- **Accept**: paper cut list matches Stage 2 effective sizes exactly for resized + shaped parts.

### O7 — Edgeband length report (metres + cost)
**Status: [x] built 2026-10-25 — in-app check pending.** Mark: "report can go in room/job reports for now.
we'll work on a report centre later" — so the Stage 2 summary line is NOT built (revisit with the report centre).
- **Data**: `OptiPart.eb_tape` = finished banded length (mm) per edgeband product, set at snapshot time —
  `normalize.ts` push (one tape per part: `edge_band_id`, else the tape used with the same material,
  as the thickness fallback; custom parts always by material) and `benchtopParts.ts` (the row's
  `edgebands.mm` per tape id — members under a shared strip carry none). `ebFields` now also returns
  `on` (which footprint sides are banded, kept when the thickness is unknown — eb_* read 0 then);
  `OptiShape.op_band` = banded? per op edge alongside `op_tape`.
- **Rule** (`src/lib/optimiser/edgebandLength.ts` `bandedLengthMM`): rectangle = banded sides at finished
  length (w1/w2 run along h, h1/h2 along w). Shaped = the banded edges of the op outline it is cut to,
  classified as `cutBlank` does (edge tag, else the rectangle side it lies on, inner edges none) — arcs
  by the sampled polygon (≤0.2% short). A STALE drawn shape isn't cut → its rectangle. Recomputed from the
  outline rather than `meta.tapeLengthMM`, so drawn and resolver shapes follow one rule.
- **Report** (`app/canvas/[roomId]/EdgebandReport.tsx`, ReportsModal "Edgeband Length"): reads the SAVED
  snapshot via `loadProjectParts` (what the optimiser nests — removed parts out, overrides + shapes in),
  scoped to the rooms in view. Per room: tape lines (parts, metres, + waste, $/m, cost) and a per-cabinet
  breakdown; job scope adds totals. Waste % input in the header (localStorage `rhk.edgebandWastePct`,
  default 10). No price → "—" + an unpriced count; banded edge with no tape → "Tape not set" (amber).
  Tape name = brand + name, + W×T only when the name carries no size.
- **Finish column** (Mark 2026-10-25: "can we have the finish put next to it … from the room properties if the
  board colour is selected"): a MATCHING tape (finish / colour "Matching", or `material_match_id` set) takes the
  board it goes on — the part's saved `material_id`, i.e. the job → room → cabinet cascade incl. Room Properties
  picks and cabinet overrides — so one tape splits into a line per board colour. A bare board that has colours
  shows "<board> — colour not chosen" (amber + footer count). A fixed tape shows its own colour + finish
  ("White STP"; hex swatches skipped). RHK6581 Kitchen today: Matching Col A → "PT Colour Matt 16mm — colour
  not chosen" (parts saved before a colour was picked; re-resolve after picking to see the colour).
- Tests `__tests__/edgebandLength.test.ts` (rect / L / arc / custom fallback / unknown thickness / rollup /
  benchtop). Verified headlessly (`z_plan_automation/verify-o7.mjs`) on RHK6581 Kitchen: BC-14 hand calc —
  drawer fronts 2×2(265+235)+2(265+170) = 2.87 m Matching Col A; White = 2 notched gables × 570 (front
  runs 145+210+215, finger-pull recesses not taped) + bottom 236 + rail 236 + 3 drawer backs × 155 = 2.077 m → 2.08 ✓.
- Per-part banded length: rects = sum of banded edge finished lengths (stored dims are finished
  size — edgeband-size-conventions); shaped parts = `meta.tapeLengthMM` (recompute from
  segments if meta missing).
- Rollup by edgeband product → total metres (+ waste factor, settable, default ~10%) × 
  `cost_per_metre` (first consumer of that column). Surface: new report in ReportsModal +
  a summary line in optimiser Stage 2. Exact placement/format = Mark's call at implementation.
- **Accept**: metres match hand-calc on a known cabinet (incl. one shaped part); report prints.

**Order**: O1 → O2 → O3 → O4 → O5, then O6/O7 in either order (both depend only on O1/O2).

---

## Deferred (explicitly out of this phase)
- True polygon/NFP nesting (shaped offcut reuse).
- Shape display in elevations.
- Banding authoring UI on shape segments (segment flags still seed from the rect part's banding).
- Two-sided machining (door-faces Phase B — separate track).
- Snapshot-uid instability / reload-a-saved-run / `output_to_cnc` reset on resolve (pre-existing).

## Session log
- **2026-10-25** — O7 built (see its status block). Report lives in Room / Job Reports until the report centre.
- **2026-10-18 (fixtures session)** — benchtop sink / cooktop cutouts reach the CNC: `OptiPart.cut_holes`,
  `shapes.placedHoles`, `GcodeInput.holes`, `routePerimeter(…, inside)` + `toolPathLoop(…, inside)`.
  Rect / outline output unchanged (all fixture tests pass). Detail in z_fixtures/FIXTURES-SPEC.md.
- **2026-10-18** — O5 built (see its status block). Arcs (O4) checked in-app by Mark.
- **2026-10-16** — O2b + O3 + O4 built (see their status blocks); side bug (A) fixed, plus the
  drawn-shape drill-shift bug and a bit-too-big gouge guard. Side bugs B–E still open. Awaiting
  Mark's check on RHK6581.
- **2026-08-03** — O2 done + verified headlessly. Found + fixed the ShapeEditor endpoint-only
  bounds bug (see O2 status block). DATA NOTE for Mark: BC-09's Right Gable now has r2 (no-op
  re-save) + r3 revisions and the part grew to 725mm deep — that's the drawn grow-wider arc
  finally applied by the fixed save path; restore r1 / Remove shape if unwanted. Next: O3
  (sheet preview + shape_polygon).
- **2026-08-02 (2)** — O1 done + verified headlessly. Notes: BC-09's shaped gable stored NO size
  override (bbox equalled base size — no-op writes are skipped by design), so the verifier hunts
  for any cabinet with a real sw/sh/sd override (found BC-13 front_rail). Optimiser stage
  stepper only navigates to visited stages — headless scripts must click "Next →", not "2Parts".
  Stage 2 shows CUT sizes when the profile deducts EB — assertions must match the overridden
  axis only. Next: O2 (shapes into the snapshot).
- **2026-08-02** — Phase opened. Pipeline explored end-to-end (optimiser = snapshot reader of
  the six part tables; nester rect-only; routePerimeter 4-corner; EB deduction rect-only; no
  metres reporting anywhere). All four scope decisions locked with Mark (optimiser-side
  overrides, bbox nesting, EB deduction ON shaped edges, all three extras in). Plan written.
  Nothing coded yet.
