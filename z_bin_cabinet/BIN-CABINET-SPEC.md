# Bin Cabinet (BBIN) — Spec

**Status:** B1–B5 live; parametric 3D bin (build_bin.py port), elevation outlines and cabinet-sheet hardware row built 2026-10-17. Remaining: plan-view outline (bins still not drawn in plan), real per-bin GLBs if supplied.
**Owner module:** `z_bin_cabinet/`
**Source data:** `Nikpol-Teramo-TDS-2026-05.pdf` (tech data sheet, May 2026) and
`teramo-p5..p8.png` (install template + drilling pages for each bin height).
**Touches:** hardware library (slides), `resolveDrawerStack`, `slideDrilling.ts`,
dividers (`z_dividers`), cabinet library (`cabinet-codes` skill: `BBIN`), placement warnings.

---

## 1. Goal

One `BBIN` code that works at any width the plan gives. The resolver picks the
Teramo bin that fits the space inside the cabinet, pricks the gables (or
divisions) and the door, all from the bin product, with no collision
solid like the CV version.

## 2. Teramo range (from the data sheet)

| Code | Module | Fits inside width | Bin height | Volume |
|---|---|---|---|---|
| TERAMO-32L | 300 | 262–280 | 620 | 2×16L |
| TERAMO-62L | 400 | 362–380 | 620 | 2×31L |
| TERAMO-56L | 450 | 412–430 | 460 | 2×28L |
| TERAMO-66L | 450 | 412–430 | 540 | 2×33L |
| TERAMO-74L | 450 | 412–430 | 620 | 2×37L |
| TERAMO-94L | 600 | 562–580 | 620 | 2×16L + 2×31L |

All need 520 depth inside and come with DTC runners. The template also shows a
500 module (462–480) that Nikpol does not sell.

**Drilling is one pattern, moved up or down by bin height.** H = bottom gable
row above the floor: **345 / 430 / 510** for the 460 / 540 / 620 bins
(pages 6–8). Every hole is a 2mm prick (B-D5).

Gable (or division) face, from the cabinet front edge:

| Column | Back from front | Holes at |
|---|---|---|
| Front | 37 | H, H + 95.5 |
| Middle | 261 (37 + 224) | H, H + 95.5 |
| Rear | 422 (261 + 161) | H, H + 89.5, H + 101.5 (two top holes 12 apart, see query) |

Door back face: two brackets, one 26 in from each side of the opening.
Pricked at the bracket's two slotted holes: **D** and **D + 85**, with
D = **129 / 214 / 294** (always H − 216). The bracket's two small inner holes
(15 in from each end) are not pricked.

Not CNC: the lower-runner holes (the 9 / 32 groups at H − 31.6 / H − 30.4,
data sheet step 9) are drilled on site.

**Query (rear column):** the drawing shows two top holes 12 apart at the rear
with no note on which is used. The install steps call for 6 screws per gable
(3 plate + 3 runner), so one of the pair is probably for the left-hand side
and the other for the right. **Locked (user, 2026-10-16): prick both** until a real plate is checked.

## 3. Locked decisions (user, 2026-10-16)

**B-D1. Variable width, one code.** `BBIN` takes its width from the plan. The
bin model is never part of the code.

**B-D2. Module size = outside cabinet width.** Bins are specified by the outside
width ("a 450 bin" = a 450 cabinet). Inside = width − 2 × gable thickness.

**B-D3. Gables are 16.5 whiteboard.** This is already the shop default:
`shop_material_defaults` interior for base/wall/tall = `Whiteboard 16.5mm`.
The bin pick must read the **resolved** gable thickness off the cabinet,
never a constant, because gable thickness varies (that's why each bin has an
18mm width adjustment). At 16.5 the modules come out at 267 / 367 / 417 / 567
inside, all within range.

**B-D4. When nothing fits, warn and offer divisions.** For example, a 500 cabinet
that has to take a 450 bin (467 inside, the bin needs 412–430). The cabinet gets
a placement warning with a button that adds **a division each side, so the bin
sits central** (user, 2026-10-16). The bin's holes then go into the divisions,
not the gables. (The runners already mount to dividers: `z_dividers` V2,
`memberBounds`.)

**B-D8. No 350 bin.** 350 is dropped (user, 2026-10-16). Library and plan
widths for `BBIN` are 300 / 400 / 450 / 600; anything else gets the B-D4 warning.

**B-D5. The CNC pricks every bin hole, 2mm deep.** Both the door bracket
holes and the gable / division holes are marking pricks, not full holes
("for now": gable pilot holes may come later).

**B-D6. Heights are measured from the cabinet floor** = top of the bottom board.
Both the gable rows and the door holes use this datum.

**B-D7. Inner drawer above the bin only when it fits.** `BBIN` = tallest bin
that fits. `BBIN+I1` = the tallest bin that still leaves room for an inner
drawer above it. If none does, it warns. Only the 450 module has a choice
(460 / 540 / 620 high).

## 4. Design

**A bin is a slide product.** A Teramo is a frame on runners with the door
fixed to it, which is what `hardware_slides` + `drawer_slide_operations`
already describe:
- `nominal_length` = 520 (minimum inside depth), `box_height` = bin height.
- New columns: `kind` (`'slide' | 'bin'`), `inside_width_min`, `inside_width_max`.
- Drill ops: `cabinet_member` (gable or division plate holes) and
  `drawer_front` (door pricks, `depth_mm` 2). One set of ops per bin height,
  so each of the six products carries its own rows. The "one pattern + height
  offset" is a seeding convenience, not a schema feature.

**Front.** The bin front is a `drawer_face` zone with a new `drawer_type: 'bin'`:
no drawer box is built, and the rail's Y datum is the cabinet floor (B-D6),
not a box bottom line.

**Pick.** `findBin(insideW, insideD, openingH, products, wantInner)`: filter
`kind='bin'` by width range, depth and height, then take the tallest (or, with
`+I1`, the tallest that leaves inner-drawer room). No match gives `NO_BIN_FITS`,
with the nearest-narrower bin and the divisions needed to fit it.

**Divisions fix.** Applies a `vsplit` to the cabinet's internal grid so the
bin column is central and its clear width is mid-range for the chosen bin:
void | division | bin | division | void, with equal voids.

## 5. Phases

| Phase | Scope | Status |
|---|---|---|
| **B1** | Schema: `kind`, `inside_width_min/max` on `hardware_slides`; seed the six Teramos + their drill ops | ✅ applied 2026-10-16 — seeded inactive, switched on 2026-10-16 after B2 deployed |
| **B2** | Filter `kind = 'slide'` on every active-slide query (loadCabinetInput, SchedulesClient, CabinetSheetReport, InternalGridEditor, DrawerBoxPreviewPanel), **then** set the bins active. Resolver: `drawer_type 'bin'`, `findBin`, floor datum, gable + door drilling (2mm pricks); `NO_BIN_FITS` warning | ✅ live 2026-10-16 (fe12004) — see as-built notes |
| **B3** | Library: `BBIN` and `BBIN+I1` cabinets; `+I1` inner drawer placed above the bin | ✅ built 2026-10-16 — see as-built notes |
| **B4** | "Add divisions" action on the warning | ✅ built 2026-10-16 — see as-built notes |
| **B5** | 3D: bin frame + bins drawn in the cabinet (layer-registered, `z_display_layers`) | ✅ built 2026-10-16 (generic shape) — see as-built notes |

**B2 as built (2026-10-16):**
- `DrawerFrontType = DrawerType | 'bin'` on `DrawerTypeConfig.type` and `ResolvedDrawerStack.drawer_type`
  (`DrawerType` stays box-only for inner drawers / methods).
- `loadCabinetInput` loads one hardware query and splits it: `slide_products` (kind ≠ bin) and
  `bin_products`. The four UI runner lists (SchedulesClient, CabinetSheetReport, InternalGridEditor,
  DrawerBoxPreviewPanel) filter `.eq('kind','slide')`.
- `resolveDrawerStacks` bin branch: `memberBounds` (gables or dividers) gives the clear width;
  `findBin` picks it; rails sit on the faces at the floor; `slideDrillOps` with the new
  `frontDatumY` = floor so door pricks are floor-referenced. No fit → `NO_BIN_FITS` warning naming
  the bin divisions would fit (`binForDivisions`). Shaped cabinets → `BIN_SHAPED_UNSUPPORTED`.
- Face grid editor: Drawer type buttons now System / 5-Piece / **Bin**; switching between drawer and bin
  drops a forced `slide_product_id`.
- Not yet: the 3D view draws the bin rails as plain runner slabs (620 tall) until B5; the cabinet sheet
  hardware list doesn't list bins yet.

**B3 as built (2026-10-16):**
- Driven by contents, not the code: any bin cabinet whose interior holds an `inner_drawer` / `pull_out`
  fitting keeps `BINUP` (new rule, default 140) clear above the bin; none fits → tallest bin that
  fits + `BIN_NO_ROOM_ABOVE` warning.
- Fittings start at bin top + `BINGAP` (new rule, default 10): `resolveInternalParts(…, { fittingFloorY })`
  lifts only the fittings' compartment boxes; dividers / shelves keep full height. The resolver plans
  the bin off a first interior pass (it needs the dividers), then re-runs the interior lifted.
- At 900 high / 140 kick (687 interior): `BBIN` 450 → 74L (620); `BBIN+I1` 450 → 66L (540), 147 left above.
- Library: `BBIN` and `BBIN+I1` in Drawers, 450×900×580 defaults (`migration_b3_library.sql`).
- Rules in the Job / Room properties under **Bins**.
- **Finger-pull rails cap the bin (user, 2026-10-16):** the usable height stops at the bottom of the
  lowest backing rail above the bin over its span (`resolveDrawerStacks(…, backingRails)`; the
  resolver's bin plan calls `fingerRails()` on the first pass). BC-23 (900 high, 100 kick, sharknose
  top): 74L → 66L.
- **Override:** the face grid editor's Bin select (Auto (picked) / any bin) writes
  `drawer_type_config.slide_product_id`. A forced bin that misses the width, height or depth still
  resolves, with a `BIN_FORCED_MISFIT` warning.

**B5 as built (2026-10-16):**
- `src/lib/binGeometry.ts` `binShape(stack)`: runners (12 × 40) on the mounting faces, a 3mm tray on
  them, bins standing on the tray — two front-to-back, four (2 × 2) when the clear width ≥ 500 (600 module).
  Pure, cabinet-space boxes, so plan / elevation can reuse it.
- `src/components/three/Bin3D.tsx` draws it inside `DrawerAssembly`'s moving group (slides out with the
  front). New display-layer item `bins` (3D, default shown). Bin stacks no longer draw their rails as runners
  in 3D; elevation / plan still show the rails until they get the bin outline.
- **Parametric bin (2026-10-17):** `binShape()` is now a port of the shop's `build_bin.py` (this folder):
  fixed frame (plate, skirts, back) + runners hanging from the top; moving carrier (rails, front/mid/back
  bars); tapered bins on the floor with rim, lid and lid handle. Sized from the bin pick (clear width ×
  bin height × depth). Bin plan size scales with the space (the script's fixed 320 × 246 rim only fits
  its own 370-wide space — reproduced exactly there); 600 module = 2 × 2 bins. Frame + runners stay put
  when the drawer opens (`Fixed` cancels the travel of the group tagged `userData.drawerTravel`).
  NB the script's ProductSpec "74L" (362–380 / 540 high) disagrees with Nikpol's TDS (412–430 / 620);
  the app uses the TDS via the bin pick.
- **Models:** a bin product's `model_url` still renders in place of the parametric bin, FITTED to the bin
  envelope from its bounding box (any units / size; model_anchor_x/y/z nudge in mm). None set today — the
  user's 360 × 540 74L GLB (source copy here) was replaced by the parametric bin. `.glb` is in the
  proxy's static-file skip.

**B4 as built (2026-10-16):**
- `NO_BIN_FITS` carries `action: { type: 'add_bin_divisions', void_mm, bin, zone }` (new optional
  `ResolverError.action`) when the bin sits between the carcass sides and a narrower bin exists:
  void = (inside − 2 × board − mid-range) / 2. 500 cabinet → 6.5mm voids, 421 clear, 74L.
- `applyBinDivisions(tree, void)` (src/lib/binDivisions.ts): void | old tree | void, single divisions,
  voids locked. Refuses an interior that is already a vsplit (that's the user's own layout).
- Buttons: the Errors tab card ("Add divisions for the Teramo 74L") and the Face Grid Bin section
  (`app/canvas/[roomId]/binDivisionsAction.ts`). Turns has_internal on if needed.
- Known: full-height divisions split a finger-pull backing rail to the bin column.

**2D views + hardware sheet (2026-10-17):**
- `binOutlines(stack, 'front' | 'side' | 'top')` flattens `binShape()` to rectangles / trapezoids
  (duplicates drawn once). Drawn instead of a bin's rails in: room elevation (ElevationSVG), print
  elevation (ElevationPrintSVG), cabinet sheet front / side / 3D sketch (CabinetSheetSVG), and the
  cabinet editor's front / top / side views (ResolvedViews — dashed, not selectable). Gated by the
  `bins` layer, now on in elevation as well as 3D. Plan view still draws nothing for a bin.
- Cabinet sheet hardware: bin fronts are listed as the picked bin ("Teramo 74L · 620 high · runners
  incl."), from the resolved stacks, and are kept out of the drawer-runner estimate (which used to
  count a bin front as a runner pair). A bin front with no bin placed → "Pull-out bin — none fits".

## 6. Answered questions (user, 2026-10-16)

1. 350 cabinets: scrapped, not needed (B-D8).
2. Division layout: one division each side, bin central (B-D4).
3. Gable holes: 2mm pricks for now (B-D5).
