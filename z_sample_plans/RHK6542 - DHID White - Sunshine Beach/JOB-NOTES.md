# RHK6542 DHID - White - 4/39-41 Elanda St, Sunshine Beach

Project `073332e0-8a03-4071-9c10-8ba098cd9e22` (created 2026-11-03). Designer: Di Henshall Interior Design (DHID order 2690.013). Client: Robin & Tim White.

## Sources
- `\\server\Data\_JOBS\RHK6500 - 6599\RHK6542 - DHID  White - Sunshine Beach\ARCHITECTURALS\Study Plans and Site Measure.pdf` (DHID A117 / A118 rev 5 + Mark's site mark-ups)
- Cabinetry schedule, trade brief, quote issue 3 (same job folder)

## Job set-up
- Doors / panels: style Laminex 16mm Colour, colour **Natural Walnut** (new 2026-11-03: board `LX Colour 16mm – Natural Walnut` c46d95fc, colour row 8629dd21). Panels 16.5; t.door resolves 16.5 here, so a dz-582 panel = 600.5 (robe panels set 581.5).
- 33 board: `LX Board 33mm – Natural Walnut` (b44a5113), tape `LX 1mm Matching 40 – Natural Walnut` (642a3c92, width TBC). Mark: all walnut shelves 33 LX board, no doubling up.
- Handles: job schedule Set Back SQ Edge Finger Pull; per-front `Linear Standard Archive 240` (c0f8c980, drawers) / `912` (aec08746, display door), fixing centres TBC so handle holes are off (`handle_drill: false`).
- Kick 80 (TOEH 80), face walnut at job level; robe kick Whiteboard (KICK 2 toekick_overrides).
- Robe: Whiteboard carcass, white seen end, white bulkhead.

## Mark's answers (2026-11-03)
1. New project yes. 2. North wall 4595 (drawing). 3. Overheads 2700, flush with the desk end.
4/5. 120 bulkheads everywhere (CH 2540 → tops at 2420).
6. Fillers against walls 16.5. Display cupboard same depth as the open shelves incl door (335).
7. Desk top 732 finished; the file pedestal on an 80 kick.
8. Sliding doors left out for now. 9. Robe seen end white.
10. New materials; 33 LX board for all shelves; kicks walnut except the robe (white whiteboard kick face).
Robe: 520 carcass, 600 end panel right (S), 200 deep panel left (N) against the wall flush with the front; bulkhead flush with the 600 panel, 200 return L, 600 return R.
(Mark's note list ended at "4." — check if there was more.)

## Rooms
| Room | Room id | Status |
|---|---|---|
| Study | a81555f3-22f3-4efd-947b-4e083bf49c94 | Drawn 2026-11-03, 0 errors (layout `z_plan_automation/layouts/rhk6542-white-study.json`, post `_tmp-6542-study-post.mjs`, CAD `_tmp-6542-study-cad.mjs`). Walls clockwise from NW: 1 desk 4595, 2 robe 3079, 3 door 1515, 4 pier 707 (detached, re-entrant corner), 5 display 3080, 6 balcony 2372. **Wall 1**: BFK 16.5 + D2-SL 700 pedestal (200 drawer over 413 file drawer, 240 handles, walnut right end), joined KICK 1; WUP desk top 33 walnut 2700 x 700 top 732; BEPF 33 walnut leg 700 deep at 2667; overheads underside 1430 dy 990: WEP 16.5 front filler, W2D 700 (set back finger pull, 2 fixed shelves), WOPN 1983.5 open 3x3 (33 top/bottom/shelves/dividers/right end, 16.5 left end + back, 350 flush, SCRBK 0); BH 120 flush with doors, right return 350. **Wall 2 robe**: TEPF N panel 200 deep at the front (Applied Panel dx '200', z 'cab.d + t.door + 2 - 200'), 2 x T2D 891.5 open (doors off), 520 deep, adj 461/842 + fixed 1223/1604/1985, joined KICK 2 (white), TEPF S 600 white, BH 120 white (L 200 / R 600 returns). **Wall 5 display**: 220 bare wall at the pier, TEPF 16.5 walnut, T2D 517 cupboard 1 door hinged left + 912 handle (walnut inside, 33 top/bottom + 5 fixed shelves 515/947/1379/1750/2106), T2D 2310 open 3 bays 737 (33 top/bottom/shelves/dividers, staggered fixed shelves per DHID elevation: 515/1242/1674/2106, 515/947/1379, 515/947/1674/2106), TFKW 16.5 at the balcony wall; kicks unjoined (mixed depths 317 / 335); BH 120 walnut flush, left return 335. CAD: spec block + SITE NOTES + LED / desk / sliding door notes. Check pending. |
| Danny's Robe | 830e087b-d817-4843-b766-5fbdd8ee6c4a | Drawn 2026-11-03, 0 errors (layout `z_plan_automation/layouts/rhk6542-white-danny-robe.json`, post `_tmp-6542-danny-post.mjs` STEP=fix (widths + joinKicks), `_tmp-6542-danny-rev1.mjs`, CAD `_tmp-6542-danny-cad.mjs`). Source DHID A116 rev 5. Walls clockwise: 1 left return 725, 2 robe back wall 3000, 3 right nib 725. TFKW 30 whiteboard each end (dz 578 = flush 580), lowers 80 -> 2010 (T2D 902.5 / 1135 / 902.5, 580 deep, open), separate W2D 390 uppers 2010 -> 2400 (open, empty) for the 33 double top, BH 140 raw MDF untaped (painted by others), KICK 1 white 0 -> 3000. TC-02: shoe pull-out = inner drawer five_piece h 82 at Y 64 (front 100 at 66-166) with sides + back Removed (shelf + front), Dragon Pro 500x80 picked as runner - runner TBC; rail Y 1824. TC-03: 2 inner drawers 178 at 16.5 / 237.5 (fronts 196, 25 gaps), AV fixed shelf 460.5, flap door 221 hinged bottom, handle none, whiteboard (material_overrides.door_face), fixed shelf 681.5, TV False Panel custom part z 283.5 (front 300 off the back) x 1102 x 1215.5, LED route = CAD note. TC-04: 3 inner drawers 178 at 16.5 / 237.5 / 458.5 (25 gaps), fixed shelf 681.5, rail Y 1824. Check pending. |

## Mark's answers, round 2 (2026-11-03)
- Notes list: nothing after "4.".
- Dividers 16 → new Materials **Divider** role (z_dividers V6); room_materials divider = LX Colour 16 Natural Walnut (all classes). WC-04 / TC-07 dividers now 16.5, display bays 748.
- Display top openings 248: fine. Robe shelves 16.5 whiteboard: fine. Overheads 2700 flush with the desk: confirmed. 0.5 over on panels: fine.
- Desk wall cleat: added on WC-01 (custom part Wall Cleat, front, x 716.5 → 2667 = 1950.5 long, 80 high under the top, 16.5 Natural Walnut, bottom edge taped, grain across = horizontal).

## Round 3 (Mark 2026-11-03)
- TC-06 display cupboard: no handle (zone handle_id 'none'); internals 16.5 whiteboard (exposed_interior off, overrides cleared), fixed shelves kept at 515 / 947 / 1379 / 1750 / 2106 (sizes 418.5 / 415.5 / 415.5 / 354.5 / 339.5).
- BC-02 pedestal: top drawer box was 178 at Y 436.5 → 614.5, 12 into the top rail (602.5); forced Dragon Pro 500x127 Silk White (top 563.5). Resolver has no box-vs-flat-top-rail check (only finger rails, D25).

## Round 4 (Mark 2026-11-03) — `_tmp-6542-study-rev4.mjs`
- WC-03 overhead cupboard: no handles (zone handle_id 'none'; Mark: never finger pulls on overheads, as a rule) + under panel WC-08 (WUP 16.5 walnut, 700, dz 312 = 20 back from the carcass front), WC-03 SCRBT 16.5 inside dy 990.
- BC-04 BEPF 16.5 walnut at 716.5 on the pedestal's right (680.5 deep, under the desk top); BC-02 right gable back to whiteboard. Desk cleat now 733 → 2667 (1934).
- Display open unit split into 3 cupboards, each 770 with its own 16.5 walnut gables: TC-07 (754, bay 1 shelves 515/1242/1674/2106), TC-09 (1524, 515/947/1379), TC-10 (2294, 515/947/1674/2106). Inside 737.
- TC-06 handle Linear Standard Archive 912 (custom timber), centred on the door height: handle_offset 1170 (door 2340, bore centres unknown — re-set offset to 1170 − centres/2 once known), 50 from the non-hinged edge.
- Bulkheads set back 18 (front 'carcase'), raw MDF 18 (material_overrides.exposed MDF 18mm), all tape off (edge_overrides case_bh:*): WC-05 front 332.5, dx 2684 (ends 16 short of WC-04's right end), right return 332.5; WC-06 front 582, L return 200, R 582, bottom return 200 mitre; WC-07 front 317.5, L return 317.5.
- Layout JSON is the first draw only; rounds 2–4 are DB edits (scripts above).

## Round 5 (Mark 2026-11-03) — `_tmp-6542-study-rev5.mjs`
- Bulkhead notes "MDF BULKHEAD - PAINTED BY OTHERS" on the Wall 1 / 2 / 5 elevations; spec block BULKHEADS 18mm MDF - painted by others.
- WC-04 back: grain up the panel (was cut along the width). 1934 wide > 1211 walnut sheet across the grain, so Mark: 2 pieces, comment "join together" → `split.back_x [983.5]`, 2 × 924 x 967, labels `Back Panel (split left / right)`, comment `SPLIT - LEFT/RIGHT · JOIN TOGETHER`. The bay 2 shelf screw on the join is left out (2 holes).
- LED: recessed route (as TC-03: 18.5 x 9 pocket, 8mm Downshear T110, 6 past both ends) in the underside of WC-04's bottom (33) and WC-08's under panel (16.5 — leaves 7.5 under the route), in line, back edge 50 off the back wall (pos_x 59.25). Elevation note updated.
- Wall 5 elevation: clear-opening dims between the shelves, one vertical chain per bay a quarter in from its left (`_tmp-6542-w5-dims.mjs`, dims tagged `style.tag 'shelf_gap'`, re-runnable). Bulkhead notes left-aligned so they clear the bulkhead size label.
- WC-01 custom part renamed "Under Panel" → "Desk Top" (cabinet_custom_parts.name).
- WC-04 back/bottom screws were on the bottom's back edge: joint 5mm Dynamic Holes used `T / 2` (bottom 33 → 16.5) — now `CW / 2` (z_joints, centre of the 16.5 back = 8.25). Shelf holes in the back now on the 33 shelf centres too.
- WC-04 `case_back` (left piece) is hidden in plan + elevation + 3D = **Removed**, so the optimiser leaves it out — asked Mark (2026-11-03).
- BC-02 drawer fronts (200 + 413) grain matched: group GM1, vertical (Mark). Optimiser: one block on sheet 3.
- Robe (Wall 2) top 2420 → 2400 (Mark): TC-01 / TC-04 panels 2400, TC-02 / TC-03 2320 on the 80 kick, WC-06 bulkhead 140 (auto_h off, hangs from the 2540 ceiling). Walls 1 + 5 stay 2420 / 120. Shelves re-space equally. `_tmp-6542-robe2400.mjs`.
- Robe end panels TC-01 / TC-04 = **16mm PT Colour Matt – Classic White Matt** (Mark; were Whiteboard): exposed override + the applied panels' material. Spec block updated.

## Round 6 (Mark 2026-11-03) — `_tmp-6542-study-rev6.mjs`
- WC-07 bulkhead now stops flush with TC-06's carcass, not over the TC-05 tall end panel: 237 → 3080.5 (dx 2860 → 2843.5), left return 317.5 kept on TC-06's left gable. 0 errors.
- WC-01 wall cleat (1934 x 80, grain_across = grain along the 1934): the optimiser already nested it that way; the 3D view drew custom-part grain up the 80 (ignored grain_across) — fixed in code, now drawn along the 1934.
- 3D Machining layer (Layers › Hardware) shows hand ops such as the WC-04 / WC-08 LED routes (off by default in 3D).

## Open / to check
- Overhead cupboard fixed shelves whiteboard, equal spacing.
- Sliding doors 25mm Designer White (2mm brushed grey frame) to come.
- Archive handle fixing centres.

## Danny's Robe answers (Mark 2026-11-03)
- Carcass 580. 30 fillers either end. Bulkhead MDF, painted by others. Fixed panel note: disregard.
- Inner drawers with 25 finger gaps. Flap = hinged panel door off a fixed shelf behind.
- TV: false panel out 1/2 depth of the robe; site note (no LV wire through the wall) on the plans.
- Shoe pull-out: just a pull-out shelf in 16 whiteboard with a front.
- LED routed in the underside of the top; cupboards above separate (double top / bottom).
- Kick white. Sliding doors left for now.
- Round 2 (`_tmp-6542-danny-rev2.mjs`): flap 25 finger gap at the top like the drawers (door 470.75 -> 656.5, face row 1 = 185.75); shoe shelf locked on Dragon Pro 500x80 Silk White for now; TV panel stays 16.5 with 2 TV Cleat custom parts behind it (16.5 whiteboard, 1102 x 100, carcass Y 1170 / 1520 = 1250-1350 / 1600-1700 AFF, z 267).
- Round 3 (`_tmp-6542-danny-rev3.mjs`, `-rev3b.mjs`): AV flap inset flush with the inner drawer fronts - zone face_ins 3.5 (front face 576.5), REVL/REVR/REVENDL/REVENDR 18.5 on TC-03 so it is 1098 wide like the fronts, rows 458.5 / 196 -> flap 460.5-656.5 (196, 25 gaps above and below). AV shelf int_fixed_shelf_0 set back 20 at the front by part size override (part_pos_overrides sd 543.5, front at 560 behind the flap). Flap hinges locked, mounting_surface 'shelf' (plates on the AV shelf top). Resolver fix: pivot (top / bottom) hinge plates now sit under each hinge's cup on the shelf / panel face (were all at mid-door, mid-shelf); HINGE_FIXED_SHELF_CLASH skips top / bottom hinges.
- Shoe shelf now a Dragon Pro 500x80 SYSTEM box (back + bottom, steel sides), front 98 at 66-164; drilling = the runner's own pattern. The 80's drawer_slide_operations are a straight copy of the 95's (front 64/96 above box - 16.5, back 32/64 up) - real Dragon Pro 80 positions TBC.
- Open: inset flap is on the Blum 110 overlay hinge - needs an inset hinge / plate choice.
- Round 4 (`_tmp-6542-danny-rev4.mjs`, `-rev4b.mjs`): the sd size override shrank the AV shelf from the back, so it still fouled the flap. AV shelf is now a fixed_shelf FITTING (y 460.5) in the drawer compartment with setback_front 22 (front 558, 2 clear of the flap's back at 560); override removed. Resolver: fixed-shelf fittings now honour their own setback_front / setback_back.
- Round 5: LED recessed route on TC-03 case_full_top underside (`_tmp-6542-danny-led.mjs`): pocket 18.5 x 9, T110 8mm Downshear, front edge 50 back from the front (pos_x 520.75 from the back), 1114 long = 6 past both ends, raster 90. Checked in a headless optimiser run (sheet 4, Z 16.5 -> 7.5). Standard written into the draw-plan skill. TC-02 shoe drawer down to box 16.5 / front 18.5 -> 116.5 (2 off the bottom like TC-03) (`_tmp-6542-danny-rev5.mjs`).
- Round 6 - Mark's updated site measure on the PDF (`_tmp-6542-danny-rev6.mjs`): 2984 f/p wall to wall, 716 o/a return wall, CH 2554 off slab to finished plaster, no deduction. Room / walls 2554, walls 1 + 3 716, wall 2 2984. Robe stays 2400, bulkhead WC-04 154 x 2984. 30 fillers kept, TC-03 / WC-02 kept 1135 (TV), outer bays 894.5 (TC-02 / WC-01 at 30, TC-04 / WC-03 at 2059.5, TC-05 at 2954), KICK 1 2984. Notes moved, SITE NOTES updated. The layout JSON is still the first 3000 draw.
- Round 7: spec block + SITE NOTES moved to x 3700, clear of Wall 3's dims (`_tmp-6542-danny-block.mjs`). Sliding doors drawn in CAD only (`_tmp-6542-danny-slide.mjs`, all rows tagged style.tag 'sliding_door'): 4 x 761 x 2400 x 25 (2984 + 2 x 30 overlap / 4), ends on the back track (plan y 610-635), middle pair on the front track (640-665), tracks 30 apart (5 gap). Elevation: front doors solid, back doors' hidden edge dashed, slide arrows. Real sliding door build to come in its own conversation. WC-04 bulkhead out 100 (dz 680, 15 in front of the front doors) + 200 bottom return, mitred, untaped (`_tmp-6542-danny-bh.mjs`; the bottom-return mitre has no bevel geometry yet, z_bulkhead known gap). LED route on TC-03 moved to 60 back from the front (pos_x 510.75) (`_tmp-6542-danny-led60.mjs`).
- Round 8 (`_tmp-6542-danny-rev7.mjs`): TC-03 / TC-04 fixed shelf top 800 AFF (carcass 720, underside 703.5, section 687) with every finger gap kept 25: inner drawer fronts 203.33 (cabinet `drawerbox_overrides.IDB_FRONT_TOP_ADJUST` 27.33, absolute - resolver now merges a cabinet's IDB_* drawerbox_overrides into the inner rules), boxes 16.5 / 244.83 / 473.17, fronts 18.5-221.83 / 246.83-450.17 / 475.17-678.5. TC-03 flap = the same 203.33 at 475.17-678.5 (face row 0 473.17), AV shelf up to 475.17. 0 errors. Hanging rails -> Nikpol OVALRODALUM (shop default row recoded; spec block updated). Sliding door CAD lines 0.18 (thinnest).
- Round 9 kick (2026-11-03, z_kick_join KS1): KICK 1 2984 split with Set seams: face at 2059.5 (2059.5 / 924.5, on the TC-03 / TC-04 joint), sub front 2400 / 584, back mirrored 584 / 2400, all JOIN. Set in the DB; open Kick split… › Save to re-resolve. Check pending.
- Round 9 (`_tmp-6542-danny-rail.mjs`): rails TC-02 / TC-04 unlocked, now hang at the centre-pillar drop (standard): centre 53.5 under the top underside 1913.5 -> rail 1845-1875 (was 1824), HANGING RAIL notes moved. Finista pillar drops 50 -> 53.5 in the library (71.5 overall, estimated ring from the photo).
- Study display wall kick (2026-11-03, `_tmp-6542-study-kick.mjs`): TC-06 -> TC-08 joined full length as KICK 3, 2843.5, built to the deepest 335 (TC-06 is 317, so the kick sits 18 further forward there). Set seams: face 1287 / 1556.5 (on the TC-07 / TC-09 joint), sub front 2400 / 443.5, back 443.5 / 2400, all JOIN. 0 errors. Check pending.
- KICK 3 face re-split for the walnut vertical grain (face max 1200, the sheet width): 517 / 770 / 770 / 786.5 on the TC-06 / TC-07 / TC-09 / TC-10 joints. Sub front + back unchanged (2400 / 443.5, 443.5 / 2400). 0 errors.
