# RHK6595 Caloundra Kitchens — 1/21 Parkedge Rd, Sunshine Beach

Drawings (latest): `SynologyDrive/_JOBS/RHK6500 - 6599/RHK6595 - CKC - 1-21 Parkedge Rd Sunshine/ARCHITECTURALS/1 of 21 Parkedge Rd, Sunshine Beach - Revised 5th November (Drawer under oven).pdf`
(Caloundra Kitchens job #3431, client Jenny & Greg Kenny, Liam G 5/11/2026, 10 pages: plan, benchtop, elevations, 3D,
appliance list). The 28/10/2026 rev 0 `Park Edge Dr, Sunshine Beach.pdf` is in `ARCHITECTURALS/_SUPERSEEDED`.
The 5/11 changes have been applied: see "FILE NOTE 2026-11-05" and "Rev 4" at the end.

## Job-level setup (2026-10-30, `z_plan_automation/_tmp-6595-setup.mjs`)

- Project `0ebb6866-f1ff-4fcf-b000-17dceb207df4`, cloned from RHK6592. TOEH 100. Class dims base 930/560, wall 747/320, tall 2340/580.
- Doors per the title block: **lower = LX Colour 16mm Winter Sky** (new colour `d57653a2`, material `38d56943`, finish Flint)
  on base + tall + panels; **upper = LX ABS Grain 18mm Sublime Teak** (new colour `bd47d2f0`, material `d67d85b0`) on wall class.
  Face colours are guesses (#56677a / #a8713f).
- Handles: new **Handle House C128 Maleny** (`82f50f69`, satin nickel, 128 centres, length 140 assumed) + schedule
  **Handle House Maleny 128** (`f9dfa969`): horizontal on base doors / drawers / tall doors; overheads push-to-open.
- Kick face Whiteboard 16.5 (drawing: "16.5mm Carcase White Panel").

## Mark's answers (2026-10-30)

1. Colours as per the title block; ABS Grain in 18mm, Winter Sky in LX 16mm. 2. Appliance cupboard = normal doors, bi-fold later.
3. Column above the bench set back (500 carcass). 4. Appliance cupboard + 390 over = ONE carcass. 5. Both drawer runs 202/323/302.
6. Base panels below the bench; wall fillers + panels above. 7. Overheads 320 carcass. 8. Island top 20 overhang both sides.
9. 400 drawers under the cooktop. 10. Melamine as loose parts in their own room + CAD showing it.
11. Microwave sits in the microwave (appliance) cupboard. 12. Sink is drop-in; drawn undermount for now (no drop-in in the library).
13. Overheads adjusted to suit: 765 overall, top 2340, 625 clear over the 950 bench.

## Rooms

- **Kitchen** `d113bd53-5e4a-4ded-9592-cc1f7bc0eecb` — layout `z_plan_automation/layouts/rhk6595-parkedge-kitchen.json`,
  post-draw fixes `_tmp-6595-fix1.mjs`. Resolver clean.
  - W2 sink wall (E->W): BEPF 16.5 | D3 711 | D3 711 | B2D 700 sink (rails on edge) | BEPF 16.5 | 608.5 DW | BEPF 16.5. KICK 1 joined.
  - Above: WEP front filler 16.5 | WC-02 W2D 711 x 1390 x 500 column on the stone (1000 doors w/ Maleny handles hinged 100/880,
    fixed shelf, 390 PTO doors, bottom Removed) | WEP 18 seen side | 3 x W2D 672 x 747 (SCRBT 18) + WUP 2016 set back 20 | WEP 18.5 front filler.
    Bulkheads 100 over both (oversized, cut on site).
  - W4 = the melamine closure line (16 wall, soffit 274): WC-10 open box 890 x 436 x 690 over the fridge, 3 x 3 cubbies of 124 left; BH 274 over.
  - W6 island (back-to-back line y 302): front BEPF 16.5 | UBO 600 | D3 690 (top false, 400 x 178 boxes) | D3 689; back 3 x B2D 264 deep
    PTO (BC-02 BACK_JOIN between_sides for the downdraft vent). **Island kicks not joined** — joinKicks hangs on the mixed-depth modal
    (backs 264 / fronts 560 on the same line). Each cabinet has its own kick.
  - CAD text notes: W4 melamine closure, plan closure note, W2 microwave cupboard, W6 cooktop.
- **Loose Parts** `e01106df-71c7-4db4-9165-3bfc69daa21e` — TC-01 carrier (TEPF) with fixed custom parts: 1 x 2400 x 900 + 2 x 2400 x 70
  Whiteboard 16.5, no tape (`_tmp-6595-loose.mjs`).

## Open

- Benchtops (2780 x 600 wall run; island 2016 x 900 with 20 waterfall east end), sink/tap/cooktop/oven fixtures, spec blocks — not drawn.
- Bosch PVQ811H26E spec sheet not in the job folder — drawer depth 400 is a placeholder; cooktop cutout is wider than the 690 cabinet.
- Island kick join. Handle length.

## Rev 1 (Mark 2026-10-30) — WC-10 cubbies half-checked

- New feature z_dividers V5 (half-check crossings): WC-10's cubby block flagged `half_check`. 2 dividers full height (400),
  2 shelves full width (400), notched 18.2 wide (18 teak + 0.2) to the depth middle + 5 (336 of 672); shelves from the back,
  dividers from the front; no joint drilling (fixed through top / bottom / gables).
- Cubbies resized for the 18 board: block 400, rows + columns equal = 121.3 square (drawing's 124 was for 16 board).
  Applied with `_tmp-6595-hc.mjs`; the layout JSON now carries it.

## Rev 2 (Mark 2026-10-31) — appliance cupboard bi-fold

- WC-02's 1000 appliance doors are now a Finista BF-05 sliding bi-fold (z_bifold_slide), **hung on the left**, **no bottom
  guide** (the cabinet bottom is Removed, it sits on the stone), standard centre hinges. The 390 PTO doors + fixed shelf over stay.
  Set as `rule_overrides` BIFOLD L / BIFOLD_BOTTOM none (WC-02 stays its own cabinet, not swapped to W2D/BF, so its two rows stay).
- Needed a resolver change (d2c5fa2): the bi-fold can be one row of a multi-row front, and the top track hangs under the fixed
  shelf over the pair (underside 991.5): carriage cups at 944 / 880 on the leading door, 22.5 in.
- Outer (left) door keeps its 100 / 880 hinges, no handle; leading door has the one handle at the joint; centre hinge holes at
  100 / 880 ± 16, 15.5 from the joint (door gap 1). Re-resolved with `_tmp-6595-bifold.mjs`, no warnings.
- Order: LS 7104969 left set + track 7104967 (top only, 675 long) — both listed as clearance / discontinued, check stock.

## Rev 3 (Mark 2026-10-31) — top cupboard split off

- WC-02 split into two cabinets (easier to fit):
  - **WC-02**, 711 × 1000 × 500 on the stone: the bi-fold appliance cupboard, 1 adj shelf, bottom still Removed. Its own top
    is now the track panel: carriage cups at 936 / 872.
  - **WC-14**, 711 × 390 × 500 over it (pos_z 1000): plain W2D, 2 PTO doors (room schedule). REVB 2 keeps the doors at 388
    with the 2 gap over the bi-fold doors, as before.
  - The fixed shelf is gone: the top of WC-02 + the bottom of WC-14 take its place.
- Applied in the DB + re-resolved (`_tmp-6595-split.mjs`), no warnings. The layout JSON carries the split (WC-14 = last entry).
- Fix (same day): wall units hang from the 2340 top line, so the 1000 WC-02 first sat at 1340–2340, over WC-14. New rule
  WALLZ (f7ec94e: a wall unit's own height, set from "Elevation from floor" in the sidebar) — WC-02 WALLZ 950 stands on the
  bench (950–1950); WC-14 hangs from the top line (1950–2340).

## FILE NOTE 2026-11-05 — revised drawings in, CAD not updated yet

Done in Rev 4 (2026-11-07); see below.

- Liam Green (Caloundra Kitchens), email "RE: Quote Request - Parkedge Rd, Sunshine Beach", Thu 5/11/2026 9:27 am ("Sorry take 2",
  to Charlene, cc Mark). PDF saved to ARCHITECTURALS: `1 of 21 Parkedge Rd, Sunshine Beach - Revised 5th November (Drawer under oven).pdf`.
  The old set has been moved to `_SUPERSEEDED`.
- Liam (9:23 am): "She contacted me this morning and asked if she can have a drawer under the oven. If so, please add this in
  (Not displayed on these drawings)". **The drawer under the oven is not on the new drawings.** It has to be added from the email.
  The oven is the Westinghouse WVEP6716SD 600 in the island front (UBO 600). We still need to choose the drawer height and the oven
  cavity / UBO height.
- Charlene (9:27 am) asked Liam whether he got the quote and if one drawer is enough or a full requote is needed. Check for a
  reply before redrawing.
- Differences between the 28/10 and 5/11 PDFs, checked by comparing the text and the page images:
  - Date 28/10 -> 5/11 on all pages.
  - Handles **Handle House C128 -> C138** Maleny satin nickel (p10 appliance list). Our handle is C128 (`82f50f69`, 128 centres),
    so the handle + schedule need updating to C138 (centres / length TBC).
  - The island cooktop sits in a slightly different spot in the 3D views (p6, p7, p9). The plan (p1) and benchtop (p2) pages
    are unchanged, so this may only be a re-render. Confirm the cutout position.
  - Small line shifts on the p4 fridge-box cubby elevation and the p3 drawer lines. The dimensions read the same.
  - Nothing else on the plan or the elevations changed.
- To do: add the drawer under the oven, change the handle to C138, check the cooktop position, then re-resolve and reissue.

## Rev 4 (Mark 2026-11-07) — 5/11 drawings applied

- **No drawer under the oven.** The island oven cabinet BC-11 (`4cb2b290`) stays a `UBO`: false panel / 600 open (locked) /
  false panel. The two panels are unlocked, so they come out equal. Already set up this way, so nothing changed.
- **Handles = Handle House C138 Maleny, size TBC.** The job's handle `82f50f69` was renamed from "C128" (it was used only by this job);
  it is still drawn at 128 centres x 140 long until the size is known. Schedule `f9dfa969` was renamed "Handle House Maleny C138".
  **The builder drills and supplies the handles themselves.**
- Cooktop position: the plan / benchtop pages are unchanged, so it stays where it is.

## Markup + waterfall (2026-11-07)

- **Markup** per the new standard `z_CAD_tool/MARKUP-STANDARD.md` (`_tmp-6595-markup.mjs`, `_tmp-6595-markup2.mjs`):
  18 notes, all `style.src = 'markup-std'`, insert only (Mark's wine-rack question + arrows untouched).
  - General: dashed DW box + "re-using existing freestanding 600" (elevation + plan), sink/tap models, oven model (Wall 6),
    fridge existing (Wall 4), open box + cubbies Sublime Teak 18 (Wall 4).
  - Questions for Client: clouded bulkheads "colour TBC" (Wall 2 + Wall 4), handle C138 size TBC.
    **The plans give no bulkhead colour**; the renders show it matching the overheads.
  - Site notes: bulkheads oversized, cut on site; overheads push to open. Electrical: recessed LED strip, pendants owner supplied.
- **Island waterfall** (`_tmp-6595-waterfall.mjs`): Benchtop 1 east edge 2986 -> 3006, WF profile, mitred (20 leg inside the
  edge, 2016 overall per page 4). Before-state saved in `_tmp-6595-bt1-before.json`. Both tops set to the 20mm Stone schedule
  (`_tmp-6595-btsched.mjs`); they had none. Depth left at the auto-built 904 (plan says 900).
  The island top was anchored to Wall 5 (stub wall), so it did not show on the Wall 6 elevations: re-anchored to Wall 6
  (`_tmp-6595-btwall.mjs`). Top + mitred leg now print on Wall 6 front + back.
- **WC-10 fillers (Mark):** WC-10 is 890 wall to wall and needs a filler each side. New library item **WF-L** planned (one 16.5
  board between the cabinet side and the wall, L-shaped in side view: 70 front leg full height + 70 bottom leg full depth,
  front + bottom edges edged, colour to match the cabinet = Sublime Teak). Not built yet: side custom parts can't take a notch.
- **BC-13 689** (`_tmp-6595-bc13fix.mjs`): the draw left the island's last front drawer bank at 672.5 (layout + page 4 say 689),
  leaving a 17 gap to the waterfall. Set back to 689 through the canvas API; resolves clean. Cause not found: no script
  set 672.5, so the canvas placement trimmed it by 16.5 when drawn.
- **WC-10 fillers (built 2026-11-07):** new library item **WF-L** (`cf3eea4b`, `_tmp-wfl-def.mjs`): WEP-style side panel
  with a formula notch (`cab.h - 70` x `cab.d - 70` off the back-top), so the legs stay 70 at any size. Placed WC-15 (x 0)
  + WC-16 (x 872), 436 x 690 x 18 LX Abs Grain Sublime Teak, front + bottom edges taped; WC-10 890 -> 854 at x 18
  (`_tmp-6595-wfl-place.mjs`, `_tmp-6595-wfl-fix.mjs`). Code: side custom parts take notches (partCutouts / partSolids).
  A 16.5 teak board (LX Colour 16mm Sublime Teak) exists if Mark wants 16.5 instead.
- **Island back (Mark):** BFK 70 (BC-14) at the Wall 5 end of BC-01, BC-01 616.5 -> 546.5 (`_tmp-6595-bfk.mjs`).
  BC-01/02/03 + BC-14 in Sublime Teak 18: door style = the job's upper style, fronts via the cabinet `door_face`
  override (the job colour grid beat the zones' own door_colour_id), exposed = teak 18 (`_tmp-6595-doorface.mjs`).
- **Push-to-open (Mark):** new catalogue handle **K-Push Tech Long Concealed (buffer)** (`3b00f8ae`, Furnware DPC5B.WH.FG,
  white, grip `push`, price TBC: trade login) on every BC-01/02/03 door, replacing the generic "Push to open"
  (`_tmp-6595-kpush.mjs`).
- **2026-11-08 (Mark): BFK = material-thickness side-on board.** BC-14 -> 18 wide, one 18 teak board flat against Wall 5,
  on the kick, out to the teak door face (`cab.d + 20`); BC-01 546.5 -> 598.5 (`_tmp-6595-bfkside.mjs`). BC-10 BEPF -> BFK
  the same way in Winter Sky 16.5 (`_tmp-6595-bc10bfk.mjs`). Library: BFK changed to this, old front-face filler = new
  **BFKW** (`_tmp-bfk-bfkw-def.mjs`, BFK before-state in `_tmp-bfk-before.json`).
- **Fillers 70 wide (Mark 2026-11-08, planer blade 82):** BC-10 / BC-14 boards -> 70 strips at the front, flush with the door
  faces (578.5 / 284), not full-depth panels; library BFK the same (`_tmp-bfk-70.mjs`). BC-01/02/03 already have 1 adj shelf each.
- **Appliance specs (2026-11-08)** downloaded to the job's `APPLIANCES` folder (README there): oven WVEP6716SD x4, Bosch
  PVQ811H26E x4 (incl. installation instructions), Abey LUA190 sheet, Blanco LINUS-S install (generic); links for the
  C138 handle, K-Push, pendants. DW + microwave are existing (no specs).
- **Kicks (Mark 2026-11-08): match the cupboards above + joined.** Job kick face (Whiteboard 16.5, title block) removed
  (`_tmp-6595-kickmatch.mjs`, before-state `_tmp-6595-kick-before.json`), so kicks take the front above: Wall 2 + island
  front Winter Sky, island back teak (BC-14 + KICK 3 set teak by hand: no fronts of their own). Island joined as two runs:
  KICK 2 = front BC-10..13 (560), KICK 3 = back BC-14, BC-01..03 (264) (`_tmp-6595-joinkicks.mjs`, `_tmp-6595-kick3teak.mjs`).
  Code fix: detectKickRun keeps a run to one facing (island front / back rows were mixed into one run).
- **Sink = Abey Lucia LUA190PK (2026-11-08):** new GLB `public/fixture-models/Abey_Lucia_LUA190.glb` from
  `z_fixtures/make-lucia-sink-glb.mjs` (spec-sheet sizes, plan / elevation outlines in `Abey_Lucia_LUA190.shapes.json`),
  catalog `69e35552`. The job sink row (`dda70361`, was the Abi Seba 550 stand-in) swapped in place, centred on BC-07,
  drop-in: flange on the 950 bench (z 750), cut-out 565 x 400 (`_tmp-6595-lucia.mjs`, `_tmp-6595-sinkz.mjs`, before
  `_tmp-6595-sink-before.json`). Handedness checked in 3D: big bowl on the left seen from the front.

## 2026-11-08 — Loose Parts redrawn + WC-10 egg-crate drilling
- **Loose Parts** room: one carrier per piece on Wall 2, all face-on (orientation front) so they read in elevation.
  TC-01 2400 x 900 at 0, TC-02 2400 x 70 at 1000, TC-03 2400 x 70 at 1170. Whiteboard 16.5, no tape (`_tmp-6595-loose-resolve.mjs`).
- **WC-10** half-checked fixed shelves now drill into the left gable + the 418 division, and the egg-crate dividers into the
  bottom / top (Mark: V-D8 revised from "no drilling" to "drill the ends, never the crossings").

## Rev 5 (2026-11-11) — check measure (Flavio, CKC, email "Check Measure - 1/21 Parkedge Rd" 10/11)
Applied with `_tmp-6595-r5.mjs` (db + resolve) + `_tmp-6595-r5-oven.mjs`; before-state `_tmp-6595-r5-before.json`.
- **Wall 2 = 2770 (was 2780).** East end came in 10 (Wall 1 return + Wall 2 start x 2780 -> 2770); the west end, sink and
  DW 608.5 opening didn't move. BC-05 / BC-06 711 -> 706; overheads (Mark: off the 3 x 672) WC-04 / 05 / 06 -> 668.5 / 669 / 668.5;
  WUP WC-12 2016 -> 2006; bulkhead WC-09 2052.5 -> 2042.5; KICK 1 2122 -> 2112; Benchtop 2 east edge 2770. Wall 2 markup
  (DW box + text, bulkhead cloud) moved with it.
- **WC-10 wine box 480 deep external** (Flavio asked 460 shelves / 470; Mark: 480). Front kept flush with the nook (pos_y 204 -> 414,
  back 210 off the Wall 4 closure); WF-L fillers WC-15 / 16 the same. Cubby shelves / dividers 462 deep, half-checks follow.
  Bulkhead WC-11 left at 690 (wall to front). Mark's "how deep" question note edited to the answer.
- **WC-10 right bay: 1 adj shelf**, standard pin cluster (2 rows x 5 holes @ 32 each side).
- **BC-11 oven to the top, drawer under** (reverses Rev 4's "no drawer"; the builder asked). Rows: drawer 224 front / open 600 locked;
  fixed shelf under the oven (top at 226), oven fixture z 326. Handle on the drawer per the schedule (not drilled).
- **No handle holes on this job:** project rule `HANDLE_DRILL: false` (the installer drills; owner keeps changing her mind).
- Resolver: clean except BC-07 HINGE_RAIL_CLASH (hinge 1 ~726 vs the 750–830 upright rail). BC-07 wasn't touched, so this was already there. The oven fixture flags a clash with BC-01 / BC-14
  (600 deep oven body vs the 560 cabinet, plan overlap), same as before the lift.

## Rev 6 (2026-11-11) — Liam's reply ("RE: RHK6595 CKC ... (your job #3431)", Tue 10/11 7:43pm) + Mark
Applied with `_tmp-6595-r6.mjs` (db + resolve); before-state `_tmp-6595-r6-before.json`.
- **Bulkheads Sublime Teak 18** (Liam: match the overheads): WC-08 / 09 / 11 `material_overrides.exposed` teak. TBC notes
  edited to the answer; the two TBC clouds (Wall 2 + Wall 4, markup-std) were left in place.
- **Wine rack = the whole box** (client text 10/11 "can above fridge be all wine"): WC-10 right bay = a second 3 x 3 half-checked
  block -> 6 x 3 square cubbies 121.3, middle divider full height. Rev 5's adj shelf is gone. CKC offered a fee: Mark is
  checking the board quantities before quoting it.
- **Overheads 350 incl doors** (Liam: they do 350 so the LED recess clears): carcass 320 -> 330 (+2 gap + 18 door). WC-04/05/06
  dz 330, bulkhead WC-09 330, under panel WC-12 310 (20 set back kept). WC-02 / WC-14 column stays 500.
- **Recessed LED** in under panel WC-12: pocket 18.5 x 9 (T110), back edge 30 off the back wall, full 2006 + 6 past both ends.
- **WC-07 -> WF-L** (Mark): the west-wall WEP front filler is now the L-shaped wall filler (side-on 18 teak, 70 legs), in place,
  dz 350 to the door face.
- Ducting: Liam runs it down the cabinet behind the cooktop and boxes it in white himself. **No second back for BC-02** (Mark).
- Fridge recess panel = white melamine, no edging: as drawn (Loose Parts).
- Resolver clean except BC-07 HINGE_RAIL_CLASH, which was already there.
- To check: the LED pocket sits at the back of WC-12 in the cabinet 3D / cut sheet (frame copied from RHK6586 WC-09).
- **Overheads 625 clear (Mark, same day):** they had been drawn 747 since the first draw, with the under panel inside the SCRBT 18
  scribe = 643 clear, not the 625 in answer 13. WC-04/05/06 747 -> 765 (top 2340, underside 1575), under panel WC-12
  pos_z 1593 -> 1575 (`_tmp-6595-oh765.mjs`). Doors 765. WC-07 WF-L was already 765.
- Wall 2 elevation dim bench (950) -> under panel underside (1575) = 625, under WC-04 (`_tmp-6595-dim625.mjs`, markup-std, General layer).
- **Spec block** on the plan (Mark 2026-11-11, `_tmp-6595-spec.mjs`, General layer, x 3700): BENCHTOP 20mm Stone colour TBC (the {benchtop} field filled '-'), {fronts} + teak extras, handles (builder drills), {carcass}, OVERHEADS 625 above benchtop to underside.
- Spec block handles line (Mark 2026-11-11): 'supplied + fitted by others' (`_tmp-6595-spec-hdl.mjs`). The C138 handle is still on the job schedule, so it may still be costed.
- **WC-10 dividers -> bottom: 2 holes, 100 in from front + back** (Mark 2026-11-11, `_tmp-6595-wc10-2holes.mjs`). New library joint **5mm 2 Holes 100 in** (`0301f1d9`, a copy of 5mm Dynamic Holes with qty 2, 100 in, spacing D - 200), set per seam in WC-10 carcase_joints `int_divider_0..7:bottom`. The top keeps the dynamic holes. Resolve check pending (the dev server was down).
- **Bulkhead markup tidied** (Mark 2026-11-11, colour confirmed): the TBC clouds on Wall 2 + Wall 4 were deleted (Mark named them). The notes now say just 'BULKHEAD(S) SUBLIME TEAK 18' with an arrow, on the General layer; the Wall 4 note got a leader. 'BULKHEAD OVERSIZED - CUT ON SITE' was kept (`_tmp-6595-bhclean.mjs`, before-state `_tmp-6595-bhclean-before.json`).
- **WC-01 -> WF** (Mark 2026-11-11): new library item **WF** (`2d34ae94`, `_tmp-wf-def.mjs`), a straight side-on 70 strip
  (WF-L without the L, the overhead BFK), front flush with the doors, front + bottom taped. WC-01 swapped in place to WF,
  18 LX ABS Grain Sublime Teak (not the 16.5 Natural board, so the finish matches); the column WC-02 / WC-14 711 -> 709.5
  (offset 18, still tight to WC-03) (`_tmp-6595-wc01-wf.mjs`, before `_tmp-6595-wc01-wf-before.json`). Resolve pending (dev server wedged).
- **WC-10 one grid** (Mark 2026-11-11): shelves full width (818), no middle divider. One half-checked 6 x 3 grid,
  5 full-height dividers, 2 shelves, squares 121.3 (`_tmp-6595-wc10-full.mjs`, before `_tmp-6595-wc10-full-before.json`).
  The 2-holes-into-the-bottom joint keys int_divider_0..7 still cover the 5 dividers. Resolve pending.
- **Bulkheads vertical grain** (Mark 2026-11-11, new z_bulkhead B13): WC-08 / 09 / 11 Grain = Vertical. WC-09 fascia 2042.5 is now 2 pieces, 1021.3 + 1021.2 (taped joins, join over the WC-05 door gap); WC-08 727.5 + 300 return and WC-11 890 stay one piece each (`_tmp-6595-bh-grain.mjs`).

## Machining run R3 (2026-11-11)
- Kitchen + Loose Parts nested together in the browser, Pair shaped parts on, Balanced: 20 sheets, 83.3%, 210 parts
  (Whiteboard 16.5 13, LX Abs Grain 18 Sublime Teak 5, LX Colour 16 Winter Sky 2). Mark checked Stage 5.
- Saved run **RHK6595-R3**. Files: `SynologyDrive/CNCFiles/RHK6595 - CKC - 1-21 Parkedge Rd Sunshine/Kitchen + Loose Parts/`
  (material sub folders with the .anc programs, `RHK6595 cut sheets.pdf` 26 pages, `RHK6595 labels 102x48.pdf` 210, `RHK6595-R3.rhkrun`).
  One combined room folder (Mark): the Loose Parts pieces share Whiteboard 01 (2400 x 900 closure) and 13 (2 x 2400 x 70 rips) with Kitchen parts.
