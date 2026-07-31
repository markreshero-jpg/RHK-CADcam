# Shape Editor Integration — Plan & Milestone Tracker

> **Purpose of this file**: survives chat wipes. Each milestone has a status line —
> update it as work lands so any future session can pick up exactly where we left off.
> Companion docs: `SHAPE_EDITOR_README.md` (component contract), `ShapeEditor.jsx` (the component — **do not modify internals**; replacement files come from Mark's chat session), `MASTER-COPY-REQUEST.md` (batched change list for the design chat — pending as of 2026-07-29).
>
> **Status legend**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Locked decisions (agreed with Mark, 2026-07-22)

1. **A part's shape is a per-cabinet-instance override**, surfaced in the Overrides tab.
2. **Storage**: dedicated table `part_shape_overrides` with revisions — cross-save rollback ("restore previous"); "remove override" reverts to plain rectangle. In-session undo/redo already exists inside ShapeEditor.
3. **Part scope**: all four — case+toekick, internal, custom parts, doors/drawer fronts. (Drawer-box parts and slides are OUT of scope.)
   **Amended 2026-07-30 (Mark)**: drawer-box parts are IN scope — every panel part is shapeable (real case: notching a drawer back/bottom around plumbing). Slides stay out (hardware, not panels). End goal confirmed: shapes feed the optimiser next phase so shaped parts actually get cut.
4. **Phase scope**: author + persist + Part Editor display only. Cabinet 3D, elevations, reports, optimiser, G-code keep treating parts as rectangles.
   **Amended 2026-07-29**: cabinet 3D display of shaped parts pulled INTO phase (new M5b) — Mark wants the Cabinet-Vision experience: shape a gable at cabinet level and see it against the other pieces. Elevations, reports, optimiser, G-code still rectangles.
5. **Resize policy**: keep shape, flag error — never auto-scale, never auto-delete.
6. **Bounds rule**: shape may be drawn any size; **on save, the part's resolved size becomes the shape's bounding box**.
7. **Banding**: seed segment `edge` flags from the part's resolved EdgeBanding for truthful read-only tape display; pass through untouched; NO banding authoring UI this phase.
8. **Entry points**: "Edit Shape" button inside the Part Editor AND right-click on a part in the 3D view → "Edit Shape".

## Verified codebase facts (checked 2026-07-22)

- **No single `parts` table.** Resolved part rows (`case_parts` etc.) are wipe-and-reinserted by `src/lib/resolver/persistResolved.ts` on every resolve → shape storage MUST key by the stable part id, like `part_operations` does.
- **Stable part ids** (built in `Cabinet3DView.tsx` ~155–237, same ids as `PartMeta.id` / `source_part_key`):
  `case_<part_key>` · `tk_<part_key>_<sort_order>` · `int_<part_type>_<sort_order>` · `zone_<row>_<col>` · `custom_<uuid>`
- **Existing override machinery**: `cabinet_instances.part_pos_overrides` jsonb map (`canvasDB.ts:1077`) — `{ox,oy,oz, oax/oay/oaz, sw/sh/sd}` per part id. Applied **post-resolve in the view layer** via `applyPosOv` / `applySizeOv` (`Cabinet3DView.tsx:919` — `w: ov.sw ?? b.w` etc.). Face zones included (`:1307`). Box convention: **W=DY, H=DX, D=DZ** (see `OverridesView.tsx:12` comment).
- **Custom parts are different**: dims are authoritative on the `cabinet_custom_parts` row (`dx/dy/dz`, `Cabinet3DView.tsx:1559`) → bbox write targets the row, not `sw/sh`.
- **`sw/sh` overrides do NOT reach persistResolved or the optimiser** — display/report layer only. Acceptable for Phase 1; a Phase-2+ item.
- **Part Editor frame**: ops live in `pos_x ∈ [0,DX], pos_y ∈ [0,DY]` via `partFootprint.projectToFrame`; front faces resolve `dxIsWidth` (upright). The shape editor's `partWidth/partHeight` MUST come from this same frame or shapes and ops disagree.
- **Datum compensation** (README's `updatePartPosition` gap): `meta.originShift` maps onto `ox/oy` in `part_pos_overrides` — axis-mapped through the same frame.
- **ShapeEditor.jsx mounting quirks**: reads `window.innerWidth/innerHeight` at module top level → must be mounted via `next/dynamic` with `ssr: false`; hard-codes `height:'100vh'` → needs an overlay wrapper that owns sizing. `readOnly` prop not enforced — block at container level if ever needed.
- README's `cad-editor.html` test harness was not delivered (folder has only the .jsx and README).

## README ↔ codebase contradictions (do NOT follow the README on these)

- ~~`alter table parts …`~~ → no such table; use the revisions table below.
- ~~`part.pos_x - dx` compensation~~ → parts have no writable position; use `ox/oy` pos-override.
- ~~"the resolver applies the edgeband deduction"~~ → deduction happens at the **optimiser** only (machine-profile `deduct_edgeband`, `eb_w1/w2/h1/h2`). Do not add resolver-side resizing.
- ~~`part.size_dx / size_dy`~~ → those are `part_operations` columns; part dims come from `PartMeta` / the op frame.
- Per-segment `edge.profile` (bullnose/ogee/…) has **zero downstream support** — carried as opaque data only this phase.

---

## Milestones

### M1 — Schema: `part_shape_overrides` table
**Status: [x] done (2026-07-22)** — migration `shape_editor_m1_part_shape_overrides` applied live (SQL saved at `z_part_shape_editor/migration_shape_editor_m1.sql`); helpers in `canvasDB.ts` (`dbLoadShapeOverrides` / `dbSaveShapeOverride` / `dbListShapeRevisions` / `dbRestoreShapeRevision` / `dbDeleteShapeOverride` + `ShapeSegment`/`ShapeMeta`/`ShapeOverride(s)` types); round-trip verified against live DB; `tsc --noEmit` clean.

- New table (follow the migration style of `z_part_view/migration_part_editor_phase1.sql`; match existing RLS pattern on `part_operations` / `cabinet_instances`):
  ```sql
  create table part_shape_overrides (
    id           uuid primary key default gen_random_uuid(),
    cabinet_id   uuid not null references cabinet_instances(id) on delete cascade,
    part_key     text not null,          -- stable id: case_left_side / zone_0_0 / int_… / custom_<uuid>
    revision     int  not null,          -- monotonic per (cabinet_id, part_key)
    segments     jsonb not null,         -- part-relative mm, ordered CCW, exactly closed
    meta         jsonb,                  -- bounds, bandedEdges, tapeLengthMM, originShift at save
    created_at   timestamptz not null default now(),
    unique (cabinet_id, part_key, revision)
  );
  create index on part_shape_overrides (cabinet_id, part_key, revision desc);
  ```
- Latest revision per (cabinet_id, part_key) wins. No pruning yet (revisit if rows balloon).
- `canvasDB.ts` helpers: `dbLoadShapeOverrides(cabinetId)` (latest per part), `dbSaveShapeOverride` (insert next revision), `dbListShapeRevisions`, `dbRestoreShapeRevision` (re-insert old segments as new head revision — history stays append-only), `dbDeleteShapeOverride` (all revisions for the part).
- **Accept**: migration applied to live Supabase; helpers typecheck; save→load round-trips segments byte-identical.

### M2 — Mount the component
**Status: [x] done (2026-07-22)** — verified live in Chrome: smoke page (`/shape-editor-test`) + full path (cabinet 3D → right-click Right Gable → Edit Part → ⬠ Edit Shape → overlay with correct 580×750 rect, banding tape seeded on the correct edge incl. the right-gable mirror convention, Save → payload logged → overlay closes). Files: `src/components/ShapeEditor/ShapeEditor.jsx` (copied) + `ShapeEditor.d.ts` (hand-written declarations — TS otherwise infers prop types from JS defaults), `partEditor/ShapeEditorOverlay.tsx` (dynamic ssr:false, z-[70], `seedRectSegments`), PartEditor: `shapeOpen` state + header button + keyboard guards (Escape/arrows/Ctrl+Z go inert while overlay open — PartEditor's capture-phase handlers would otherwise fire first). Build + tsc clean.

**Notices from M2 (for Mark / the design chat)** — *superseded 2026-07-29: items 1 and 3 are now consolidated, with the native-embed and reference-outline asks, in `MASTER-COPY-REQUEST.md` — hand that doc to the design chat rather than these notes:*
1. `ShapeEditor.jsx` had duplicate `tabIndex`+`onKeyDown` attributes on its `<svg>` (TS17001, blocks the build). The earlier shadowed pair was removed — behaviour identical (React used the later pair anyway). **Apply the same dedup to the master copy in the design chat** so the next replacement file doesn't regress.
2. The copy replaced the OLD committed ShapeEditor at that path (the May wall-outline variant with `mode='room-outline'`, WIP paused 2026-05-28). Nothing imported it except `/shape-editor-test`, which was updated per its own header note (mode toggle dropped, now the part-editor smoke harness with ssr:false). Old variant recoverable: `git show HEAD:src/components/ShapeEditor/ShapeEditor.jsx` (+ different old copy in `z_CAD_tool/`).
3. **Bounds-rule conflict**: `checkGeometry` inside ShapeEditor ERRORS when the shape exceeds partWidth/partHeight (and `attemptSave` blocks on it) — so "draw any size, bbox becomes the part size" only works for shapes ≤ the part rect today. Growing a part needs a relaxed bounds check in the MASTER copy (design-chat change, not ours). Shrink + within-rect shapes work now.

- Copy `ShapeEditor.jsx` → `src/components/ShapeEditor/ShapeEditor.jsx` **unmodified**.
- New `ShapeEditorOverlay.tsx` wrapper (client): `next/dynamic` import with `ssr:false`; fixed full-screen overlay above the Part Editor (z-order like PartEditor over CabinetEditModal); Escape handling consistent with PartEditor's capture-phase pattern; passes props through.
- Props derivation from `PartMeta` + op frame: `partWidth/partHeight` = the same DX/DY the ortho views and ops use (respect `dxIsWidth`); `partLabel` = meta.label.
- Banding seed: map resolved `EdgeBanding` {top,bottom,left,right} + edgeband colour onto the 4 seeded rectangle edges' `edge` tags (display only). Document the side→segment mapping in code — it depends on the op frame orientation per part type.
- **Accept**: overlay opens with correct part rectangle + banding tape, draws, Save logs the mm payload, no SSR/build errors, `npm run build` clean.

### M3 — Save / load flow
**Status: [x] done (2026-07-29) — verified by Mark in-app (shorten-both-edges → r1 + sh override + reopen re-anchored).** Wired: load latest revision on PartEditor mount → `initialSegments` (button shows `(rN)` + green when shaped); save inserts revision + writes bbox→size. **Two corrections to the plan as written**: (1) the "direct sw/sh map" note from 2026-07-22 was wrong for non-face parts — override slots are cabinet-space box extents, so the write is per-kind (`displayExtents` in partEditorCore.ts: side→sd/sh, horizontal→sw/sd, face→sw/sh; custom parts via `customFieldForExtent`, mirroring Cabinet3DView's handleSizeChange, never touching thickness). (2) The shape frame is y-down but the op/CNC datum is bottom-left, so saves preserve OP-frame coords: new height = sh − bbox.minY, segments translated by −minY before storing, width = bbox.maxX. originShift→ox/oy compensation cut from Phase 1 (warn only; ShapeEditor blocks negative-coord saves anyway). `openCabinet(ref)` added to the dev bridge for headless testing.
**Manual verify (pending)**: Test Kitchen → BC-01 → right-click Right Gable → Edit Part → ⬠ Edit Shape → shorten both vertical edges to 700 (Tab → Set Length, right edge needs Fixed end=End) → Save Shape → expect: `part_shape_overrides` r1 row, `part_pos_overrides.case_right_side.sh=700`, header dims update, reopen shows the shape re-anchored to a 580×700 rect.

On **Save** (`onSave(segsMM, meta)` — guaranteed closed/valid):
1. Insert next revision into `part_shape_overrides`.
2. Bounding box → part size:
   - resolved parts: write `sw/sh` (axis-mapped W=DY/H=DX through the part's frame) into `part_pos_overrides` via existing `dbSavePartPosOverride`;
   - custom parts: write `dx/dy` on the `cabinet_custom_parts` row via `dbUpdateCustomPart`.
   - Only write when bbox ≠ current effective size (don't create no-op overrides).
3. `meta.originShift` ≠ 0 → fold into `ox/oy` on the part's pos-override (axis-mapped, sign per frame).
On **open**: load latest revision → `initialSegments`; none → `null` (component seeds the part rectangle).
- **Accept**: draw sloped gable → save → part shows size override rows in Overrides tab matching bbox; reopen editor → same shape; draw at negative coords → re-reference → save → part stays put in cabinet (ox/oy compensated).

### M4 — Overrides tab: shape rows
**Status: [x] done (2026-07-29) — verified by Mark in-app.** "Part Shapes" section in OverridesView (sky-blue, after Joint Overrides): label · segments · bbox · rN of M · date. Actions on hover: ↺ restore-previous (re-inserts prev revision as new head AND re-syncs part size from its bbox) and ✕ remove (confirm → all revisions deleted + the size slots the shape wrote are cleared; entry dropped if nothing else in it). Clear-all now wipes shapes too. **Mechanism**: shape saves now stamp `meta.sizeSlots` (which sw/sh/sd or dx/dy/dz slots the bbox landed in) + `meta.baseAtSave` (base resolved in-plane pair, via new `partBase` prop from the modal's buildBaseDims) — so OverridesView replays/clears/stale-checks without re-deriving part frames. Stale flag = current base pair ≠ baseAtSave pair (unordered, 0.5mm tol) → amber "part size changed since this shape was drawn — re-edit". Pre-M4 revisions (no sizeSlots/baseAtSave): restore keeps size as-is, stale never fires. `dbClearShapeOverrides` + revision counts added to canvasDB.
- ~~Edit-shape button per row~~ → deferred to M6 (needs the per-part-type PartMeta builder the right-click path already has; today's route: 3D → right-click part → Edit Part → ⬠ Edit Shape).
**Manual verify (pending)**: BC-01 already has a shaped Right Gable (r2) → Overrides tab shows the row (r2 of 2, no stale — pre-M4 meta). Save a new shape edit → row updates with size + stale machinery live; ↺ restores r2 and size follows; resize cabinet height → amber flag on next save's row; ✕ remove → gable back to plain 580×750 rect everywhere + sh override gone; Clear all → table empty.

- New "Part Shapes" section in `OverridesView.tsx` (pattern of Position Offsets / Joint Overrides sections): one row per shaped part — part label, segment count, bbox, saved date, revision count.
- Row actions: **Edit shape** (opens overlay), **Restore previous** (revision picker or simple "previous"), **Remove** (delete all revisions + clear the sw/sh + ox/oy this feature wrote — confirm before destroy).
- "Clear all overrides" must also clear shape overrides (keep behaviour consistent).
- **Stale flag** (resize policy): compare stored bbox vs the part's *base* resolved size (OverridesView already computes base sizes for placeholders) — mismatch renders the row amber/red with "part size changed since shape was drawn — re-edit".
- **Accept**: rows render, restore rolls back visibly, remove reverts part to plain rectangle everywhere, stale flag appears after resizing the cabinet.

### M5 — Part Editor display
**Status: [x] done (2026-07-30) — verified by Mark in-app (outline in ortho + 3D, amber op warning live; cabinet views correctly still rectangles until M5b).** New shared utility `src/lib/shapePath.ts` (shapeToSvgPath / sampleShapeOutline w/ W3C arc conversion + 16-step cubics / pointInShape w/ boundary tolerance — unit-checked; M5b reuses it). PartOrthoView front view draws the saved outline verbatim (stored frame IS the front view's SVG space; Back face flips via transform), sky stroke + faint fill, under the op glyphs. PartEditor 3D overlays a hairline `lineLoop` of the outline on both faces (y3d = sh − shapeY, 0.4mm off-face). usePartOps takes the sampled polygon and adds a per-op amber "Outside the shaped outline — this area is cut away" warning (same display-frame mapping as the glyphs, 1mm boundary tolerance so edge-plane ops don't false-flag). Overlay remounts keyed on revision so reopen-after-save seeds fresh.
**Manual verify (pending)**: BC-01 Right Gable (shaped) → Part Editor: front view shows the outline over the rect (Back face flips it on a door), 3D shows the loop on both faces; drag a drill outside the outline → amber warning appears on the op row + panel (and clears when dragged back); unshaped parts identical to before.

- `PartOrthoView`: draw the shape outline (SVG path from segments, same frame as ops) over/instead of the rectangle on the front/back views; keep ops glyphs positioned as-is (datum unchanged).
- Part 3D view (`PartViewer`): render the shaped outline — minimum: flat outline overlay on the face; stretch goal (optional): extruded `THREE.Shape` silhouette. Lines/arcs/beziers → path sampling utility (new, in `src/lib/`, shared by SVG + three).
- Ops that fall outside the shape outline: amber warning in the existing issues panel (`issuesById`) — no auto-moving of ops.
- **Accept**: shaped gable displays correctly in ortho + 3D within Part Editor; op outside outline shows a warning; unshaped parts render exactly as before.

### M5b — Cabinet 3D display of shaped parts *(added 2026-07-29 — pulled forward from Deferred)*
**Status: [x] done (2026-07-30) — verified by Mark in-app (shaped gable + drawer-box parts against neighbours, live sync from Part Editor/Overrides, kind-aware cap colours after the ±X/±Y/±Z face-slot fix).** `Part` (PartViewer) gained a `shape` prop: shaped parts render `buildShapedGeometry` — THREE.ExtrudeGeometry from the sampled outline, oriented per panel kind off the edgeStrips frame conventions (face: profile XY; side: display-x→Z with left=back, mirror flips for right twins; horizontal: display-top→+Z front), corner-origin so overrides/rotation compose. Works in solid, wire, AND both CSG paths (pockets subtract from the extruded base; drilled case parts via PartWithHoles pass-through). Caps get the face colour, walls the edge colour (ExtrudeGeometry groups 0/1); banding tape strips suppressed on shaped parts (rectangle tape would float over cut-aways). Shape state LIFTED to CabinetEditModal (single map → 3D view + Part Editor + Overrides tab stay in sync live; PartEditor/OverridesView still self-load when mounted standalone). Sampled outlines cached per part in CabinetScene so re-tessellation only happens on real change. Skipped by design: hinged-door DoorPanel (animated open/close), slide parts (hardware), Room3DScene + elevations (deferred). Drawer-box parts INCLUDED (scope amendment 2026-07-30) — same frame/mirror conventions as case parts (`db_right_side` mirrors like the right gable).
**Manual verify (pending)**: BC-01 3D view → shaped Right Gable shows its true profile against the neighbours (mirror correct: cut on the same physical edge as the Part Editor shows); save a shape edit in the Part Editor → 3D updates on return without reload; restore/remove in Overrides tab → 3D follows; wire mode + a pocketed shaped part + a drilled shaped gable all render; unshaped cabinets identical; orbit stays smooth.

- In the cabinet render path (`Cabinet3DView` → `Part` in `PartViewer.tsx`): parts with a shape override render an extruded silhouette instead of `boxGeometry` — sample segments (lines/arcs/beziers) → `THREE.Shape` → `ExtrudeGeometry`, depth = part thickness, placed through the part's existing frame (same axis mapping as the `sw/sh` overrides, W=DY / H=DX; right-hand mirror convention respected).
- Load via `dbLoadShapeOverrides(cabinetId)` alongside the existing pos/size override load; cache sampled geometry per (part, revision) — don't re-tessellate every frame.
- Known limitations this phase (render rectangle-equivalent, don't attempt): edgeband tape strips and op-hole subtractions stay rectangle-based on shaped parts; selection/hover `Edges` should still work on the extruded mesh.
- Elevations / sheet reports / optimiser unchanged (still deferred).
- **Accept**: shaped gable shows its true outline in cabinet 3D against neighbouring parts; unshaped parts and cabinets with no shapes render exactly as before; no visible frame-rate hit on a full kitchen.

### M6 — Entry points + errors
**Status: [x] done (2026-08-01) — verified by Mark in-app.** Cabinet 3D right-click menu: "⬠ Edit Shape" under "✎ Edit Part" (hidden for `slide_*`; opens the Part Editor with the overlay on top via `onEditPart(meta, openShape)` + PartEditor `initialShapeOpen`). Overrides tab shape rows: ✎ Edit button → new exported `buildPartMetaById(rp, id, customParts, partOverrides)` (Cabinet3DView) rebuilds the render-identical meta for any part id (pos+size overrides applied; per-part edge overrides skipped — async cache, banding-seed only). PartEditor hides Edit Shape for slides. CabinetErrorsPanel: amber "stale part shape" cards (from `shapeIsStale`/`shapePartLabel`, now exported from OverridesView; computed in the modal off the lifted shape map) with "Review in Overrides →". Empty-state accounts for stale shapes; errors-tab badge counts resolver issues only (stale shapes visible in the panel, not the badge — revisit if Mark wants it counted).
**Manual verify (pending)**: 3D → right-click Right Gable → ⬠ Edit Shape → Part Editor opens WITH the shape overlay up; right-click a slide → no Edit Shape item; Overrides tab → hover shape row → ✎ opens the same; resize the cabinet → Errors tab shows the amber stale card → "Review in Overrides" jumps tabs; a slide part's Part Editor has no Edit Shape button.

- Part Editor: "Edit Shape" button (header, near view toggles) → overlay.
- Cabinet 3D right-click menu (`Cabinet3DView.tsx:1710` `editMenu`): add "⬠ Edit Shape" under "✎ Edit Part" — opens Part Editor with the shape overlay immediately on top (or direct overlay; decide at implementation, prefer whichever reuses `setEditingPart` plumbing cleanly).
- Exclude non-scope parts (`slide_*` only — drawer-box parts became shapeable 2026-07-30) from the menu item and the Part Editor's Edit Shape button.
- `CabinetErrorsPanel`: surface the stale-shape error (M4's check) at cabinet level.
- **Accept**: both entry points open the same editor for the same part; drawer-box parts don't offer shape editing; stale shape appears in the errors panel.

### M7 — Native embed + reference outlines
**Status: [!] blocked — waiting on the replacement `ShapeEditor.jsx` from the design chat (`MASTER-COPY-REQUEST.md`)**

Once the replacement file lands (container sizing, `hideChrome`, dark theme, relaxed bounds, `referenceOutlines`, svg dedup):
- Drop the full-screen `ShapeEditorOverlay` in favour of an in-pane mount: Part Editor centre pane swaps 3D/ortho ↔ shape editor; Save/Exit in the Part Editor header via the component's imperative handle; `ssr:false` workaround can go if module-scope `window` reads are gone.
- Populate `referenceOutlines` with neighbouring-part projections into the part's frame (benchtop line, adjacent gables, kick) for cabinet-level in-context shaping.
- Re-verify the M2 acceptance path end-to-end after the swap (fresh rect seed, banding tape, right-gable mirror), plus the grow case the relaxed bounds check enables.
- **Accept**: Edit Shape never leaves the Part Editor window; editor matches app theme; a gable can be shaped against a visible ghost of its neighbours; growing a part past its original rect saves and writes the larger size override.

---

## Deferred (explicitly out of this phase)
- Shape → elevations / sheet reports rendering. *(Cabinet 3D was pulled into M5b, 2026-07-29.)*
- Shape → optimiser: nesting footprint, contour G-code, edgeband length from `tapeLengthMM`. (Note: even rectangular `sw/sh` overrides don't reach the optimiser today — pre-existing gap to solve together.)
- Banding authoring UI (per-edge band/profile) + `edge.profile` downstream support.
- "N edges have no banding specified" production check (README suggestion).
- Benchtop shapes, cabinet-level shape editing, annotation layers.
- Revision pruning policy.

## Session log
- **2026-07-22** — Handoff reviewed; contradictions identified; all design questions answered by Mark; this plan written. Nothing coded yet.
- **2026-07-22 (2)** — M1 + M2 done and verified (migration live, helpers in canvasDB, component mounted + browser-verified end-to-end via Test Kitchen/BC-01/Right Gable). Three notices logged under M2 — most important: ShapeEditor blocks saving shapes larger than the part, so Mark's "any size" bounds rule needs a master-copy change in the design chat before grow-cases work. Next: M3 (save/load flow). M3 notes: PartEditor is mounted only by CabinetEditModal, which already holds `partOverrides` + `setPartOverrides` + `customParts` + `setCustomParts` — pass them through as props. The editor frame = display frame, so bbox→sw/sh is a direct map (no axis swap needed). originShift→ox/oy needs the part-local→cabinet axis mapping (see partFootprint.projectToFrame) — only matters when the datum was re-referenced; consider requiring datum-at-0,0 as the Phase-1 cut.
- **2026-07-29** — Session resumed after a week on other work (island fixes, headless automation — unrelated diffs share the working tree; M1/M2 work still UNCOMMITTED, commit before M3). Mark's direction after seeing M2 live: (a) the editor must feel native — same window, CAD tools in-pane, not a full-screen light-themed overlay; (b) cabinet-level shaping like Cabinet Vision — shape a gable and see it against neighbouring parts. Plan updated: M5b added (cabinet 3D shape display, our side, pulled from Deferred), M7 added (native embed + `referenceOutlines`, blocked on master copy), `MASTER-COPY-REQUEST.md` written — the single batched ask for the design chat (container sizing, hideChrome, dark theme, relaxed bounds, referenceOutlines, svg dedup). M3 unblocked and still next; M5b after M3; M7 whenever the replacement file lands.
- **2026-07-29 (2)** — M3 done, verified by Mark. Key corrections discovered en route (recorded in the M3 status block): per-kind size-slot mapping via `displayExtents` (the earlier "direct sw/sh" note was wrong for sides/horizontals), and op-frame-preserving y re-anchoring on save (shape frame is y-down, datum is bottom-left). originShift→ox/oy deferred with a console warn. All shape work M1–M3 committed. Next: M4 (Overrides tab shape rows) or M5/M5b (display), Mark's pick.
- **2026-08-01** — M6 done, verified by Mark. All coded milestones M1–M6 complete; phase closes pending M7 (design-chat replacement file). Noted: the ↺ restore only toggles between the last two revisions (head−1 append semantics) — a full revision picker is the natural M4 polish item if deep history is wanted.
- **2026-07-30 (2)** — M5b done, verified by Mark. Scope amended mid-milestone: drawer-box parts now shapeable (locked decision #3 amendment; slides stay hardware-only) after Mark hit the exclusion live. Two fixes en route: shape state lifted to CabinetEditModal (live 3D↔editor↔overrides sync), and extruded cap colours picked per panel kind (faceColors slots are box-axis-ordered — a gable's face is ±X, not ±Z; caps show face colour on both sides, noted limitation). Known extrusion limitation: both caps share the face colour (front/back distinction only on unshaped parts). Next: M6 entry points (slide_* exclusion, right-click menu, Overrides Edit button, stale error in errors panel).
- **2026-07-30** — M5 done, verified by Mark (Part Editor only — cabinet modal views unchanged by design; that's M5b). `src/lib/shapePath.ts` is the shared outline-geometry module M5b builds on.
- **2026-07-29 (3)** — M4 done, verified by Mark. Shape saves now stamp `meta.sizeSlots` + `meta.baseAtSave` so the Overrides tab restores/removes/stale-checks frame-free; per-row Edit button deferred to M6. Next: M5 (Part Editor shape display) then M5b (cabinet 3D), or straight to whichever Mark wants.
