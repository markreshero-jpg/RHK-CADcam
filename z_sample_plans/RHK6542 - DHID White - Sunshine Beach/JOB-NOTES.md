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
