# RHK6339 Hans Const - 116 Queenscroft St, Chelmer

Client: Stacey & Ben Hollis (builder Hans Const, Dan). Architect: Croft Architects, joinery
details WD 70-75 (Tender issue A, 06/08/25). Site check measures by Rory, red pen on
`_JOBS/RHK6300 - 6399/RHK6339 - .../SITE CHECK MEASURES/site Measured plans.pdf`.
Quote 18/09/2025: J01 J02 J04 J05 J06 J07 (J03 sun room lining is not ours).

App project `cf31069b-1a56-49ee-91df-dade35f68fde`.

## Job set-up (Mark 2026-11-11)

- Fronts + exposed: **Veneer 17mm – Blackbutt** (new board `Veneer 17mm`, 2700 x 1205 - was 2408, T102),
  tape **0.5mm Matching 22 – Blackbutt** (50m rolls). Door style `Veneer 17mm` (17 blank,
  colour range `Veneer 17mm`, colour Blackbutt, grain vertical).
- **Veneer 33mm – Blackbutt** (new board `Veneer 33mm` `0157a2d8`, colour `fca041dc`, 2700 x 1205,
  T106 12 compression - T102 only cuts 25 deep), tape **0.5mm Matching 40 – Blackbutt** `579bc59a`
  (Mark 2026-11-12, for J04).
- Carcass: PT Colour Matt 16mm Black Matt (assembly schedule "16.5mm PT Black Matt").
- Handles: Sharknose Finger Pull schedule.
- Kick 100 (job TOEH). Base default 879 incl kick, 676 deep (fingerpull, 700 top).
- Tops: **35mm Solid Timber – Blackbutt** (benchtop schedule + build method "Solid Timber
  (hand made)": measure + report only, made by hand in the shop).

## J05 Study Bench (level 1) - drawn 2026-11-11, room `ab417075-b6e2-4189-93c5-c281e1f05f9b`

Layout `z_plan_automation/layouts/rhk6339-hans-j05-study-bench.json`, post
`_tmp-6339-j05-post.mjs` (top + kick join).

- Wall 1 = back wall 2830 (site). Wall 2 = W16 window end, bench butts into the frame.
- Top 700 x 2170 incl 35 waterfall leg at the left (x 660-2830). 716 site depth to the portal
  column with 1x gyprock still to go on.
- BC-01 D4 650, 4 equal drawers (127 boxes). BC-02 692.5 one door hinged left. BC-03 792.5 one
  door hinged right + 100 false panel behind the portal column. KICK 1 joined 2135.
- Rev 1 (Mark 2026-11-11): BC-02 split into two cupboards; BC-01 was 100 high with its kick
  still on: its face_grid had no `zones`, so every re-resolve crashed (`grid.zones is not
  iterable`) and the first placement's parts stayed. Zones added, re-resolved
  (`_tmp-6339-j05-rev1.mjs`, `_tmp-6339-j05-dbg.mjs`). Spec block + SITE NOTES + BC-03 column
  note (`_tmp-6339-j05-cad.mjs`).
- Portal column (Mark 2026-11-11): 100 x 100 nominal nib wall "Portal column" off Wall 2, face
  703 off Wall 1, 2700 high: solid in plan / 3D / Wall 2 elevation. On the Wall 1 elevation it
  is a dashed see-through outline + "PORTAL COLUMN (IN FRONT)" (`_tmp-6339-j05-column.mjs`).
  Column size is nominal - confirm on site.
- Height: 928 raw floor to underside of window, 14 timber floor to come -> **914 FFL top**,
  carcass 879 incl 100 kick (drawing said 930).

### Open / TBC
- [ ] 914 top height (= window underside off finished floor) - confirm.
- [ ] 100 behind the portal column (BC-03 false panel) - OK for now, **check with builder**
  (on the elevation + SITE NOTES).
- Kick vertical grain, 2 pieces - Mark OK, on the spec block.

## J02 Stair Cupboard (ground floor sun room) - drawn 2026-11-11, room `67a27d07-1012-4537-a58d-5d3b50764221`

Layout `z_plan_automation/layouts/rhk6339-hans-j02-stair-cupboard.json`, post `_tmp-6339-j02-post.mjs`.
**No site measures - drawn as per plan, ALL MEASUREMENTS TO BE SITE CHECKED** (Mark).

- Recess 820 x 440 overall x 2700 ceiling (approx). Walls: 1 left side, 2 back, 3 right side.
- TC-01 T2D 750 x 2665 incl 100 kick x 421, at 35: **35 shadow lines** each side + top (Mark),
  CAD arrows "35 SHADOW LINE" on the elevation. Gables Veneer Blackbutt (material_overrides
  left_side / right_side) so the shadow lines show veneer.
- Shadow lines built (Mark 2026-11-11, `_tmp-6339-j02-sl*.mjs`): TC-02 / TC-03 = TFKW 35 veneer fillers each
  side, dz 402 so the face (404-421) is flush with the carcass front, 19 behind the doors; on KICK 1 (joined
  820 wall to wall). WC-01 = BH 820 x 35 at the ceiling (2665-2700), `front: 'carcase'` (fascia flush with
  the fillers), fixed height (auto_h off), no cleat / returns, veneer fascia.
- Pair of doors, 5 adj shelves black. Hinge 3 moved to 1470 (was over the shelf holes 1370/1402):
  hinges [100, 691.25, 1370, 1873.75, 2465] from the door bottom.
- New handle **Custom Timber Pull 450** (solid timber, made in the shop, secret fixed, no CNC
  holes) + schedule "Custom Timber Pull 450 (tall doors)" on this room: vertical at the meeting
  edges, centre 1275 AFF (bottom 1050).
- Pulls rebuilt 2026-11-12 (Mark: one per door, flush to the meeting edge, `_tmp-6339-j02-pull.mjs`):
  timber pull (z_handles D19) = linear strip 35 x 35, 18 x 18 rebate on the hinge-side back edge,
  new material **Solid Timber 35mm – Blackbutt**. TC-01 zones handle_length 450 / handle_inset 1165
  (1050-1500 AFF), HANDLE_DRILL false (secret fixed), lh:0 / lh:1 No CNC. Pulls 1 apart (door gap 1).
- Plan CAD "TIMBER PULL DETAIL 1:4" box under the cupboard (Mark 2026-11-12, `_tmp-6339-j02-pulldet.mjs`,
  style.src 'pull-detail', re-run replaces it): both meeting edges in section, dims overridden to true sizes.

### Open / TBC
- [ ] Site measures: width, depth, ceiling.
- Doors 372.5 x 2565 were longer than the 2408 veneer sheet. Mark 2026-11-11: longer sheets -
  board **Veneer 17mm now 2700 x 1205** (whole board, all rooms). Headless nest: J02 veneer on
  2 sheets, nothing unplaced.

## J04 Sink Unit - drawn 2026-11-12, room `b2252689-fdc9-4fd7-be9a-f29853f0391e`

Layout `z_plan_automation/layouts/rhk6339-hans-j04-sink-unit.json`, post `_tmp-6339-j04-post.mjs`
(lining depth, kick join, top, CAD), shots `_tmp-6339-j04-shot.mjs`. Croft WD 72 + Rory.

- Recess 2271 frame to frame (drawing 2780), 700 back of jamb to raw wall (no gyprock). Walls 1 left
  end, 2 back, 3 right end. Joinery flush with the jamb face: top 700, carcass 676 (as J05).
- Floor 14 timber (Mark: as J05): 2228 raw to underside of shadow -> shelf top 2214 FFL. Bench 900 FFL,
  100 kick, carcass 865 incl kick, 35 solid timber top 2271 x 700 wall to wall (Benchtop 1, 865).
- Base L->R (Mark OK): BC-01 D3 580 equal drawers | BC-02 B1D 550 hinged left | BC-03 B2D 1141 sink,
  no shelf, rails on edge, undermount SS sink + HWU by others. KICK 1 joined 2271.
- WC-03 open shelf WOPN 2243 (between the linings) x 420 x 510 (setback ~190 scaled off the section),
  WALLZ 1794, 4 equal bays (3 dividers): **33 veneer** top / bottom / sides / divisions, 17 veneer back
  (Mark). 32 timber nosings left off for now - may add later.
  Rev 1 (Mark 2026-11-12): top + right side out to the bench depth 700 - part size overrides
  `part_pos_overrides` case_full_top / case_right_side `sd: 700` (grow forward from the back; optimiser
  cuts 700). Left side, bottom, dividers stay 510.
  Rev 2 (Mark 2026-11-12): no left end, top / bottom / back run into the 14 lining.
  Rev 3 (Mark 2026-11-12, `_tmp-6339-j04-rev3.mjs`): rev 2 redone NATIVELY - Edit shape footprint
  (rectangle) with the **left edge Open** (no panel; top / bottom / back 2210 from the lining). Rev 2's
  Removed left side + ox/sw overrides taken off. Elevation now draws it right. Left bay 552.5, others 519.5.
- Rev 4 (Mark 2026-11-12, `_tmp-6339-j04-rev4.mjs`): bases finish inside the 14 linings, no fillers.
  Linings WC-01/02 now floor to shelf top (WALLZ 0, 2214). Base run 14-2257: BC-01 580 @14, BC-02 550 @594,
  sink BC-03 1141 -> **1113** @1144 (took the 28), KICK 1 @14 x 2243, benchtop 14-2257 (2243 x 700).
- Rev 5 (Mark 2026-11-12, `_tmp-6339-j04-rev5.mjs`): BC-03 one adj shelf. **10 shadowline** on WC-03 = custom part
  "Shadowline strip 10": PT Black Matt 16.5 on edge, 10 high, 1107 long (left wall -> WC-04 left edge), face set back
  20 (680). Machine can't cut 10 wide well - rip / trim by hand. **Door jamb 31 x 220** (existing, fitted on site,
  by others) = BC-04, a BUP with one custom part, board `Timber Jamb 31mm (existing, by others)` (No CNC, drawn
  redder so it reads apart from our joinery). From Mark's "mark up for ai" CAD: x -206..14 (covers the 14 lining
  edge), 700-731 off the back wall (Off wall 700), 2212 high.
- Rev 6 (Mark 2026-11-12, `_tmp-6339-j04-rev6.mjs`): same jamb at the Wall 3 end = BC-05, mirror of BC-04:
  x 2257..2477 (covers the right 14 lining edge), 700-731, 2212 high. Gotcha: set the custom part AFTER a reload -
  the app's save right after placeCabinet overwrote it with the BUP placeholder size (676 x 17) the first time.
  3D share HTML: `CABINET VISION DRAWINGS/PRODUCTION DRAWINGS/RHK6339-J04-Sink-Unit-3D.html` (share3d).
- Rev 7 (Mark 2026-11-12, `_tmp-6339-j04-rev7.mjs`): shadowline wider - strip 10 -> **60 high** ("Shadowline strip 60"),
  shelf top 2214 -> 2274, still 1107 long, set back 20. 60 cuts on the machine now (no hand rip). (Wrong read - see rev 8.)
- Rev 8 (Mark 2026-11-12, `_tmp-6339-j04-rev8.mjs` + `rev8b`): shadowline = **10 thick x 60 wide on the flat** -
  custom part orientation flat, 1107 long x 60 deep x 10, on the shelf top (2214-2224), front set back 20 (620-680).
  Board still PT Black Matt 16.5 (no 10 black board in the library) - thickness to confirm.
  **Sink + tap drawn** (spec "Gym basin", Reece quote #3132738): Memo Hugo Compact Sink No Taphole SS 2402708
  (340 x 440 x 220, bowl 300 x 400 R25, cutout = bowl) undermount under the 35 top, centred on BC-03 (x 1700.5),
  front 80 back from the bench front; Caroma Villa Sink Mixer Gunmetal 6905.914A, hole 60 behind the sink on its
  centre line. New catalogue rows `3553c71c` (sink, Ohelu model stretched) / `6b7a9d8a` (tap, **Abey Lucia model as
  a stand-in**). Sink note moved below BC-03's size label. Spec also lists a Memo Zenna sink + Villa mixer for
  the J01 garage bench (not drawn yet).
- Rev 9 (Mark 2026-11-12, `_tmp-6339-j04-rev9.mjs`): "DOOR JAMB" text turned 90 (reads up) on each jamb in the
  Wall 2 elevation, 1880 up - above the size labels and clear of Mark's leader arrows.
- WC-04 A/C box W1D 1150 x 530 x 681 at the right end (offset 1107, flush with the shelf end), WALLZ 2249
  (35 shadow gap TBC), 33 veneer box incl back, front = false_panel = **17 veneer removable panel**,
  exhaust slots TBC. Size from the drawing (Mark: this size for now).
  Rev 1 (Mark 2026-11-12, `_tmp-6339-j04-rev1.mjs`): sits ON WC-03 (WALLZ 2214, no shadow gap), no bottom
  (BOTTOM_TYPE none), dz 700. Removable panel in between the sides: inset FACINS 1, side reveals
  REVSL/REVSR 35 (2 clearance), 80 gap top (REVT 113 = 33 top + 80) and bottom (REVB 80) -> panel 1080 x 337.
- 14 timber lining both ends BY OTHERS: WC-01 / WC-02 WEP 14 x 1314 x 700 (dz 681 + 19), bench top 900
  to shelf top 2214, new display material **Timber Lining 14mm (by others)** `3f6b71d6`, cabinet No CNC.

### Open / TBC
- [ ] A/C box size, exhaust slots. Panel 1 back from the box front + 2 clearance each side - confirm.
- [ ] Nosings on the shelf (Mark: maybe later).
- [ ] Back splashback finish (mirror struck out - lining only noted on the ends).

## J06 Desk + J07 Shelf Wall (one room) - drawn 2026-11-12, room `3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef`

Layout `z_plan_automation/layouts/rhk6339-hans-j06-j07-desk-shelf-wall.json`, post `_tmp-6339-j06-post.mjs`
(kick join, pelmet BH, pulls, TC-02 hinges, tops), `_tmp-6339-j06-bh.mjs` / `-fix.mjs` (BH dy 80, bases
back to 1008.5), CAD `_tmp-6339-j06-cad.mjs`, shots `_tmp-6339-j06-shot.mjs`. Croft WD 74 / WD 75 + Rory.

Mark's answers 2026-11-12:
- Wall 2 = J06 desk wall 4508 - 12 gyp = **4496**; Wall 3 = J07 wall off its end, **150 window filler past
  the 3547** = 3697. Wall 1 = W17 end. J07 wall not gyprocked: cabinets straight onto the frame.
- J06 desk (Desk A / Desk B): 35 Blackbutt, 830 deep in front of the 130 trough (y 130-960), wall to wall,
  **runs through under the J07 left cupboard**, centre join (2248) for now. 50 recessed trims are ours,
  front edge only (in the top notes, not modelled). 735 FFL (height 700). Trough + outriggers by others.
- J07: 305 overall -> carcass 286 + 17 + 2. TC-01 TFKW 150 filler 735-2227 at the window.
  BC-01 B1D 810 **fixed front** cupboard under the desk. TC-02 T2D 810 pair on the desk, **no bottom**
  (case_bottom hidden, REVB 3), 3 adj. BC-02 / BC-03 B2D 1008.5 pairs under the bench. WC-01 WOPN 2017
  open shelving on the bench (WALLZ 735, no bottom): **33 veneer** box / division / 3 shelves per bay,
  17 back. TC-03 T2D 720 one door hinged right, floor to 2227. KICK 1 joined 3547.
- Bench: 35 Blackbutt 310 deep (5 over the doors), y 960-2977, 735 FFL, same as J05.
- ~~WC-02 BH 80 pelmet~~ -> **rev 1 (Mark 2026-11-12): WC-02 = full-depth 33 veneer Blackbutt top**, WUP
  (UNDER_PANEL, part "Top", 33 veneer) 3697 x 385, window wall to the end of TC-03, **underside 2227 FFL**
  (735 + 1492), 80 past the door faces + open shelves. TC-01 / TC-02 / WC-01 up 80 to the underside (dy 1492).
  LED route 18.5 x 9 (T110) in the underside, centred in the 80 overhang (40 back from the front), over the
  open shelves 960-2977, stopped both ends. Scripts `_tmp-6339-j07-top.mjs` / `-top2` (TC-02 middle hinge
  850) / `-led.mjs` / `-top-cad.mjs` / `-top-cad2.mjs`.
- Rev 2 (Mark 2026-11-12): LED route over the open shelves only, dimensioned on the Wall 3 elevation (2017
  dim under the top); LED supplied + fitted by the electrician; route size 18.5 x 9 OK. The top's right end
  butts a door jamb: **Wall 4 = 305 return** (frame to back of jamb, 220 thick) + **door jamb 31 x 220** on its
  end = BC-04, same as J04 (BUP + custom part, Timber Jamb 31mm existing by others, No CNC), 305-336 off
  Wall 3, floor to 2260 (door leaf top = beam U/S 2227 per WD 75). Scripts `_tmp-6339-j07-jamb.mjs`,
  `-led-cad.mjs`.
- Rev 3 (Mark 2026-11-12, `_tmp-6339-j07-jamb2.mjs`): BC-04 = the whole door frame (3 custom parts, dz 800):
  near jamb on the return end, **800 head** across the top (2229-2260) running away from the J07 wall (door in
  the Wall 4 line), far jamb at its end (769-800). Jambs 31 x 220 x 2229. All existing / by others, No CNC.
- Rev 4 (Mark 2026-11-12): **beam / window lintel** over the J06 desk (WD 75 elevation, hatched box top left,
  "align pelmet to beam") = BC-05 on Wall 2, full 4496, 150 off the wall, underside 2227, 215 high (scaled off
  the 1:20 elevation, TBC). BUP + one custom part, new board `Structural Beam (existing, by others)` (grey, No
  CNC). `_tmp-6339-beam.mjs`. WC-01 + TC-02 no bottom redone natively: **Bottom Type none** (was case_bottom
  hidden + BOTTOM_BACK_JOIN, which still read "Full bottom (inherited)"). `_tmp-6339-j07-nobottom.mjs`.
- Rev 5 (Mark 2026-11-12): WC-01 **Top Type none** (WC-02 sits on it). Resolver fix: with Bottom / Top Type
  none the interior runs to the gables' edges, so the centre division is now the full 1492 (bench to WC-02),
  back full height. `_tmp-6339-j07-notop.mjs`.
- WC-02 top shortened in the app to start at the beam face: offset 147, **3550** long (to the jamb at 3697).
  The LED route is measured from the top's own left end, so it moved 147 off the open shelves; re-centred
  (pos_y 1821.5 -> 960-2977 along the wall), `_tmp-6339-j07-led2.mjs` (reads both positions, re-run after any
  move of WC-01 / WC-02).
- Tall door pulls = Custom Timber Pull 450 (as J02, zone handle_id), 770-1220 AFF scaled off the
  elevation. Base doors sharknose. TC-02 hinges [100, 850, 1389] off the shelf holes (rev 1).
- Mark's "Infil" sketch = the desk height, 735 so everything lines up.

### Open / TBC
- [ ] J07 left bay 810 (drawing 760) so its side lines up with the desk front 960; open bays 1008.5
  (drawing 940) to take up the 3547. Check with Mark.
- [ ] Desk 830 + 130 trough nominal - confirm.
- [x] LED: open shelves only, 18.5 x 9, electrician supplies + fits (rev 2).
- [x] Top's right end butts the door jamb (rev 2) - no edge.
- [ ] Beam size 150 x 215 scaled off the drawing - confirm. (Top now starts at 147, beam drawn 150 deep -
  3 overlap; one of them to match the other.)
- [ ] Door frame height 2260 assumed (door head over the 2227 leaf) - confirm.
- [ ] 3547 final measure (Rory).

## Other rooms - not drawn
- J01 garage: 4411 frame to frame - 12 sheet both sides = 4387. Ceiling TBC by Rory.
  Hoop pine 19 ply in the quote.
