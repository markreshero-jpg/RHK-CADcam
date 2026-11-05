# RHK6581 — Lee Smith — 38 Howard St, Grange

Source: `RH - 38_Howard_St_Joinery_Schedule.xlsx` (client comments KB 15.10.2026) + Mark's answers 2026-10-21.
Plans: `38 Howard Street-605_(A) - JOINERY.pdf`, `38 Howard SM - Markup 260927.pdf`.

## Job-wide
- Carcass MEL01 white melamine (16mm whiteboard) everywhere, incl. J06 and J01.
- Fronts / exposed: LAM01 Laminex Elegant Oak – Absolute Grain, except J06 + J07.
- Benchtops + splashbacks BY OTHERS everywhere.
- Handles "client to purchase / fitted on site" → leave doors UNDRILLED.
- Open shelves → LAM01 (oak), not white.

## Rooms
| Room | J | Decisions |
|---|---|---|
| Kitchen | J05 | No shadowline — bench sits straight on carcass. Island curved ends = BCRVFIXP-style curved panel to floor, no kick at the curves. Rangehood canopy = curved box, wall-style curved cabinet, raw MDF (textured paint by others). Linear G handle in matching laminate — **detail to discuss, not drawn yet**. Overheads push-to-open. Sink + appliance details: attached drawings. |
| Butler's Pantry | J04 | Oak fronts/ends/kick, handles undrilled. |
| Laundry | J02/J03 | Oak fronts/ends/kick, bulkhead laminate Elegant Oak, 2400 overall. 5 adj shelves to talls. Hose cut-out in cupboard back beside washing machine. |
| Entry | J01 | White internals for now (client wants same-price options). No bulkhead — flat oak panel to top. |
| Living | J06 | Fronts + exposed = Laminex Aries **or** Surf, Natural — write both for now. Carcass white. |
| Play Room | J07/J07M | LAM03 Laminex Sunbaked Natural. Desk at J07 + J07M. |
| Bed 2 / Bed 3 | J08a/J08b | Wall-to-wall → fillers both ends. Oak bulkhead, no overheads. |
| Bed 1 | J09 | NOT IKEA PAX — we supply all cupboards. 2360 doors / ~350 wide, 340 oak bulkhead. |
| WIR | J11 | Open shelves LAM01, hanging rails (type TBC), kick to match. |
| Storage | J10 | 1000 × 2400 × 600, oak floating shelf, 300 bulkhead. |
| Ensuite Store | J12 | 1000 × 2400 × 500, 5-shelf, 300 bulkhead, white 16mm shelving. |

## Earlier work
- `z_plan_automation/layouts/rhk6581-hive-38howard-kitchen.json` — pricing layout (2026-10-09) from the
  initial pricing PDF; used shadowline + doubled-panel curved ends, both now superseded above.

## App setup (2026-10-21)
- Project **RHK6581 Lee Smith** `781bb736-79a1-4ee1-8061-b026f77ada54` — job defaults cloned from RHK6570
  (Laminex 18mm ABS Grain – Elegant Oak fronts, Whiteboard 16.5 carcass, Blum hinges).
- Job-wide: kick 100 (project rule TOEH), exposed = LX Abs Grain 18mm (job_materials, all classes),
  kick face = LX Abs Grain 18mm (job_toekick_materials), handle schedule = **Client supplied - undrilled**
  (new library schedule, no entries). Kitchen will need a room-level handle override for Linear G;
  J06 / J07 need room-level colour overrides.
- Plan sheets: SM Markup p2 = J01/J02/J03/J06, p3 = J07/J08/J10, p4 = J11, p5 = J07M/J09/J12.

## Rooms drawn
- **Laundry J02** `0be1888b-8a45-4bb6-ab8a-6febe4483288` — J02 done (layout `z_plan_automation/layouts/rhk6581-lee-smith-laundry-j02.json`):
  TFKW 30 | T2D 975 | T2D 975 | TFKW 30 = 2010 wall-to-wall, one joined KICK 1 (2010) under all; 2400 incl 100 kick; hinges moved to 2196/1623/862/100 clear of shelf holes; BH 170 flush with carcase to 2570 ceiling;
  5 adj shelves each; spec block placed, trimmed 2026-10-22 to what's in the room (no benchtop / drawers / runners / basin sections). Return wall lengths 1000 are placeholders. J03 next.
- **Laundry J03** `33ab802b-2446-4d24-9705-8c3cdc0b28bd` — drawn 2026-10-22 (layout `z_plan_automation/layouts/rhk6581-lee-smith-laundry-j03.json`):
  BEPF 18 | 620 Dryer bay | BEPF 18 | 620 Washer bay | BEPF 18 | B2D 691 sink cpbd | BFK 30 = 2015 wall-to-wall (620 clear per 600 machine). 2 x LG 12kg front loaders placed (left = Dryer). 600 OA incl the top: top 600, doors face 580, carcass 560, panels 580. Return walls 600.
  880 cabinets + 20 stone (by others, drawn 2015x600 for the cut-out) = 900. KICK 1 (721) under B2D + BFK only; bays open to floor.
  Adj shelf locked at 366.5 (250 above cabinet floor). Abi Ohelu 380 U/M sink centred on cpbd. No hose / tap cut-outs. Spec block placed.
  **Floating shelves added 2026-10-22:** WC-01 + WC-02 = FLSHLF 2015 × 350 × 36 (double LX ABS Grain 18 = LAM01), wall to wall so
  both ends unseen (back + side cleat slots, hand-cut cleats). Undersides **1730 / 2130** AFFL (tops 1766 / 2166), scaled off SM Markup
  p2 elev 6 at 1:20 (drawn ~40 thick; gaps 830 bench→shelf, 364 between, 404 to the 2570 ceiling).
- **Bed 2 J08** `267d417f-4b4b-4f6d-9d92-9db855f3eb83` — drawn 2026-10-22 (layout `z_plan_automation/layouts/rhk6581-lee-smith-bed2-j08.json`):
  TEPF 18 seen end (left) | T2D 841 hanging | T2D 841 drawers | TFKW 50 at wall (right) = 1750. 410 OA incl doors (carcass 390, SCRBK 0) —
  380 only took 300 runners, 390 takes Dragon Pro 350. 2400 incl 100 kick + 370 BH to 2770. Hanging: fixed shelf top 1920 + 30x15 oval rail 60 under.
  Drawers: fixed tops 920 + 1920, 2 adj, 4 inner drawers on Dragon Pro 350x95 (95 boxes, 113 fronts, 83 gaps) locked at 30.5/226.5/422.5/618.5 so the
  bottom hinge sits in a gap: 2196/1570/870/187 (870 = 50 above the fixed shelf top; 1570 clears shelf holes). BH 1732 from the carcass edge (flush with carcase front + side, not over the end panel), left return on, 390 deep mitre. 2026-10-23.
  Elevation CAD note "HANGING RAIL" under the rail. Spec block: no BENCHTOP section (nothing in the room).
- **Bed 3 J08** `32742187-cae6-4299-8587-ec4d52b0aa65` — drawn 2026-10-23 from Bed 2 (layout `z_plan_automation/layouts/rhk6581-lee-smith-bed3-j08.json`):
  2150 OA, 600 OA deep (ticked on markup): TEPF 18 | T2D 1041 hanging | T2D 1041 drawers | TFKW 50 at wall = 2150, carcass 580, SCRBK 0.
  Same internals + hinges as Bed 2, inner drawers on Dragon Pro 500x95. BH 2132 from the carcass, left return 580 mitre. Kick 2132. Rail note + spec block (no benchtop/basin).
- **Bed 1 J09** `4c2ae706-0732-447d-9761-d495b192e1b3` — drawn 2026-10-23 (layout `z_plan_automation/layouts/rhk6581-lee-smith-bed1-j09.json`): no PAX (schedule ignored).
  TEPF 18 seen end | T2D 750 drawers | T2D 750 drawers | T2D 750 hanging | TFKW 32 at wall = 2300; 600 OA (carcass 580, SCRBK 0); heights as Bed 2/3.
  No filler beside the seen end (door opens past 90). Internals/hinges as Bed 3. BH 2282 from the carcass, left return 580. Rail note + spec block.
- **Master Store J12** `166331f8-359a-49e1-9a7b-f7740fd7681a` — drawn 2026-10-23 (layout `z_plan_automation/layouts/rhk6581-lee-smith-master-store-j12.json`):
  TFKW 30 at the 700 wall return (left) | T2D 970 | TEPF 18 seen end = 1018 OA. 500 OA incl doors (carcass 480, SCRBK 0). 2400 max incl kick,
  BH 390 to the 2790 ceiling (1000 long, stops at the carcass), right return 480. 5 adj shelves 16 white; hinges 2196/1630/870/100 clear of shelf holes.
- **WIR J11** `08e0edfc-2feb-4bf3-b704-a3ef1d924826` — drawn 2026-10-23 (layout `z_plan_automation/layouts/rhk6581-lee-smith-wir-j11.json`): 2380 x 3922 room, 2800 ceiling, BH 400.
  Elev A: BFK 30 | open-bay D4 952 + 18 LAM01 top at 880 | TEPK 18 | D4 + W2D 962 | D4 + W2D 960 | T2D 960 double hanging | TFKW 40.
  Elev B: TFKW 22 | T2D 1000 x2 hanging (rail 1800, shelf 50 above, low shelf 400) | TEPF 18 | door | TEPF 18 | T2D 800 5 adj (markup) | TFKW 30.
  J03 floating shelves: use FLSHLF (Wall → Open Shelves, built by Mark's other session).
  Rotated 90° CCW for a landscape print (2026-10-23). Door 890 x 2040 (new library item) on Wall 4, 890 from Wall 1, hinged at the hanging end;
  Opening 820 x 2100 through Wall 1, 620–1440 from Wall 4 (scaled — confirm).
  Drawer boxes 127 high (Dragon Pro 500x127), not the auto 178 — Mark: 178 too tight for the 188 fronts.
- **Entry J01** `13f64536-e274-41a8-994d-dc051c7d511c` — drawn 2026-10-23 (layout `z_plan_automation/layouts/rhk6581-lee-smith-entry-j01.json`): 2520 OA x 500 OA (carcass 480), CH 2900.
  TEPF 18 seen end (no wall) | 500 one-door cpbd: adj 450 / hanging rail 1610 / adj 1700 AFFL (per elevation, Mark) | TEPK 18 | open seat bay 960: 2 side-by-side drawers + 18 LAM01 seat top at 450, LAM01 back panel 450–1800, 600 overhead 1800–2400 no shelf | TEPK 18 | 976 2-door 4 adj | TFKW 30 at the 1000 return wall.
  No bulkhead: flat LAM01 panel 2400–2900 flush with the door faces, over the end panel, left return. One kick 2502 wall to end panel. Overhead underside = 18 LAM01 under panel (WC-05). Hat hooks drawn in CAD at 1370 + boxed "HAT HOOKS SUPPLIED BY OTHERS". Rail note + spec block.
- **Play J07** `3737003a-5ea4-42ba-be59-c97e4b1379de` + **Play J07M** `a642f31b-05cc-47b4-ad15-22f42c2dcede` (mirrored) — drawn 2026-10-24 (layouts `rhk6581-lee-smith-play-j07(m).json`).
  Mark: ignore the "REMOVE J07 x 2" markup, still drawn. 2386 wall to wall, CH 2475, all LAM03 Laminex Sunbaked Natural 16mm (new library range "Laminex Colour 16mm" / style "Laminex 16mm Colour", room-level overrides).
  J07: desk 839.5 (16.5 top at 720, 16.5 support panel at the wall, 70 back rail on the wall under the top edged one long edge, CAD "DESK") | TEPF 16.5 | T2D 750 x 2 (5 adj each — NOT existing, Mark) | TFKW 30. J07M mirrored. 2400 incl 100 kick, 75 BH flush with carcass over the cupboards only (return on the desk side). 600 OA (carcass 582 + 16 door + 2).
- **Living J06** `f7f7a99d-91fa-4a4b-a576-152c9d318d6b` — drawn 2026-10-24 (layout `rhk6581-lee-smith-living-j06.json`): 2575 OA, CH 2680, LAM02 Aries OR Surf (Laminex 16mm, Colour TBC).
  TCRVFIXP 500 curve LEFT R370 to the floor | T2D 1022.5 | T2D 1022.5 (5 adj each) | TFKW 30 at the builder's box (403 by builder). 600 OA (carcass 582).
  Bulkhead 2400–2680: new **BHCRVFIXP** curved bulkhead over the curved end (ribs 0, flush with the curve + doors) + straight BH to the box, both with the
  new **10 shadowline split** (60 × 10 MDF rail, 10 setback; follows the curve). Curved face board butts the straight BH. Skin 2.5, 0 ribs on the curved bulkhead (Mark).
- **Kitchen J05 + Butler's J04** `1227b2c8-ee65-4ea8-a7e8-e3b1144bfcd0` — one room, drawn 2026-10-24 (layout `rhk6581-lee-smith-kitchen-j04-j05.json`), CH 2500.
  Back run (E→W): TFKW 32 | broom 600 (1 door) | WOT-COMBI 636 | 3 × D3 865 (cooktop middle) | TEPF | fridge 994 + 700 overhead | TEPF | TFKW 32. 700 bench → carcass 655, talls to 2500, bases 900 (20 slab straight on, no shadowline).
  Island 3000: BEPF | D4 448 ×2 | BBIN 450 | B2D 1000 sink | BEPF | 600 DW | BEPF; carcass 900 under the 80 apron slab, fronts dropped REVT 64. North: BCRVFIXP R300 each end
  with the new inside face panel + IBPF 2000 knee-space back. Canopy BHCRVFIXP double R200 1200 × 400 × 1000 (1500–2500), raw MDF 18. Push-to-open: oven top + fridge overhead.
  Butler's: 2 × open tall 796 (5 fixed, all 16 whiteboard, right one truncated at the R500 curved wall; both SPLIT in height at 808, 3 below the 2nd fixed shelf) + 30 / 50 fillers; west: B2D 900 + wine fridge 505 between 18 panels, bench 920 (same as the kitchen).
  2026-10-25: 30 BH flush with carcass over everything that hit the 2500 ceiling (room wall_cabinet_top 2470; not the canopy), butler's BH white;
  kick face = Elegant Oak colour; island top 5 past end panels + curves (R305), end panels / curves / IBP dropped to 840 under the 80 apron;
  sink + cooktop cut-outs + Abi pull-out mixer placed. **Linear handles built** (z_handles H9, 35 strip, sharknose, screwed from the back):
  room handle schedule "Linear sharknose strip 35" — base doors / drawers horizontal, broom tall vertical, overheads PTO, butler's BC-16 none.
  Integrated DW: generic dishwasher fixture behind BC-18 (600 x 580 x 820, linked to BC-18), label "Integrated Dishwasher Model TBC".
  Still not placed: fridge / wine fridge fixtures (spaces + CAD notes only).
  2026-10-26: TC-07 bottom two sections locked 385.25 each so its 2nd fixed shelf top = 920 AFFL, level with the BC-16 bench; upper 3 shelves re-spaced evenly (1307.5 / 1695 / 2082.5 tops). TC-08 matched the same day.
- **Hanging rails** (Bed 1/2/3, Entry, WIR): Finista oval 15 x 30 white 3.6m (Lincoln Sentry 7104006) from the new Library → Accessories tab — LS marks it discontinued / clearance, confirm before ordering.
- **Storage J10** `b10e1ba1-5f02-485c-a5e6-b631bde5de20` — drawn 2026-10-25 (layout `rhk6581-lee-smith-storage-j10.json`): 1868 to the wall, CH 2770, 600 OA (carcass 580).
  TEPF 18 seen end | T2D 950 5 adj | VOID 500 = 482 LAM01 false front to the floor (TEPF assembly with custom parts) + 3 full-height L fixing brackets (2 x 100 white strips each) | TEPF 18 side panel | 400 open bay: low cabinet 397 false front to floor, no kick + 18 LAM01 top at 415.
  2400 incl 100 kick; BH 370 flush with carcass from the seen end to the wall, left return 580. Spec block.

## Client answers 2026-10-28 (KB email) + finishes applied 2026-10-29
- New colours under board **LX Colour 16mm**: Sunbaked Natural 2598 `4963cda7`, Desert Dune 2595 `968e741f`, Paperbark `956250dc`
  (+ door colours in the LX 16 range; Sunbaked door colour relinked to its colour row).
- J01 Entry: internals (interior + shelf) = **Paperbark**. Fronts/panels stay Elegant Oak.
- J06 Living: fronts / exposed / kick = **Desert Dune 2595**. Builder's box = wall buildout by builder, no joinery (was never drawn).
- J07/J07M: **Sunbaked Natural 2598**; **desk = Elegant Oak 18** (BC-01 support panel, WC-01 top, WC-03 rail: cabinet exposed override).
  Desk re-set for 18: top still at 720 (pos_z 702), support 18 x 702, rail 821.5 x 70 x 18.
- Laundry, J08–J12: Elegant Oak Absolute Grain + white internals — already drawn that way.

## KB markups 2026-10-29 (reviewed shop drawings + appliance schedule) — NOT actioned yet
- J01 "600 oa" (drawn 500 OA) — confirm. Flat oak top panel / oak back panel already drawn.
- Kitchen: charging drawer (top of an island drawer stack, 2 DGPO at rear); powerpoint at rear of a Wall 6 cabinet; DGPO rear of cabinet; butler's TC-07/08 shelves to follow the R500 curve.
- "Flush" bulkheads (over the end panel, flush with its outer face?) — Bed 1/2/3, J07, J10, J11, J12. Confirm.
- Bed 2: "front facing hanging rail". J10: false panel removable for servicing; window in wall + shelf below sill, BH to wall — site measure.
- J11: bulkhead to continue over the doorway; light switch on side of a panel.
- Appliances (Miele): oven H 2861 BP, combi H 7240 BM (niche H 450–452), cooktop KM 7373 FL 800 (was 900), rangehood DA 2578 402 deep (box 400),
  DW G 5000 SCi SEMI-integrated (was full integrated); wine fridge Husky HUSWC93SBK min niche 522 W (drawn 505); sink Mondella double bowl 760x450; mixer Yabby Sydney antique brass.
- Still open: laundry hose cut-out, floating shelf heights 1730/2130; stonemason contact for KB.

## Lee's site-measure markups 2026-10-30 (via The Hive Co email) — PDFs in `Site Measures/Lee markups 30.10.26/`
Working through room by room. Ink is flattened into the PDF — render pages (pymupdf) to read it.
- **Kitchen J05 + Butler's J04 — DONE 2026-10-30** (Mark's answers):
  - Butler's Wall 2 1685 → **1655**: cupboards stay 796; scribes 30 (west) / **33** (curve, TC-09); BH WC-06 1642 (13 off the curve); KICK 3 1655.
    Wall 3 moved to x 1655 and made **120 thick** so the kitchen side (Wall 6 4925, ticked OK) didn't move.
  - Curved NE corner re-drawn from site: arc starts 478 off Wall 3 on Wall 2, ends 400 off Wall 2 on Wall 3, 425 on the 45° from the
    478/400 corner → arc **R473.9, centre (1186.9, 473.8)** (plan CAD arcs; outer line concentric R563.9). Not a curved back:
    TC-08 footprint back flat 351 then angled to 286 deep at its right gable (max ~96 gap behind the chord). Hand-fix joints at 33° / 57°.
  - **Nib wall (Wall 8)** on Wall 1, 1868 from Wall 2, 600 deep, drawn 90 thick (thickness not measured). Run: 404 | BC-16 **906** | 18 | wine **522** | 18 | nib.
    Benchtop 3 now to the nib (y 400–1868).
  - **Butler's ceiling 2417** (walls 1–4 + nib): talls 2370 → **2287** on the 100 kick (top 2387) + 30 white BH kept. 920 shelf unchanged.
  - **Kitchen ceiling 2509** (walls 5/6): BH WC-04 / WC-05 30 → **39**; canopy WC-02 1000 → **1009** (bottom stays 1500).
  - "Need to run power to island" = electrician note, nothing drawn. Green ticks: island services, cooktop run, combi, 4925.

### Entry J01 — DONE 2026-11-02
- Lee: "600 clashes with window" → depth stays 480 (Katherine's 600 OA request closed). 2520 / 1000 / 480 ticked.
- Lee: "Delete BH, top cap joinery" → old WC-04 flat 500 panel (2400-2900) deleted. New WC-04 = WUP top cap, 2520 x 480 x 18 Elegant Oak (part renamed "Top Cap"), sits 2382-2400.
- Joinery dropped 18 to suit (Mark): end panels TC-01/03/04 2400→2382, talls TC-02/05 + filler TC-06 2300→2282, WC-03 overhead 600→582.
- Ceiling 3021 (Lee) → Walls 1 + 2 height 3021. Gap above joinery 621.
- Carcass LX Paperbark 16 (Katherine, OK'd by Mark) — room interior + shelf were already Paperbark.
- Not done: Katherine's "Elegant Oak panel to rear" of the hat-hook bay (WC-02) — not asked for.
- Fix 2026-11-02: WC-03 was hanging from the room wall-cab-top line (2400) and running into the cap → WALLZ 1800 (sits 1800-2382, gables scribe over WC-05). Cap WC-04 pinned WALLZ 2382.
- Mark: WC-04 brought out to the door fronts → 500 deep (flush with the 500 applied end panels). 2 reveal on door tops under the cap (REVT 2 on TC-02, TC-05, WC-03): tall doors 2280, WC-03 doors 580. TC-06 30 filler left full height to the cap.
- JOB NOTE: client wanted Entry J01 600 deep, but the site measure (Lee 30/10/26) says 600 clashes with the window → kept 480 carcass / 500 o/a incl. doors. Plan CAD dim "500 O/A DEPTH" added at the open left end (also in the job's Notes field in the app).
- Top cap left (open) end taped as well as the front (2026-11-02).

### Laundry J02 + J03 — DONE 2026-11-02
- Ceiling 2551 to finished tiles (Lee) → all J02 + J03 walls 2551 (J03 same ceiling - Mark).
- J02 overall 2015 not 2010 (Lee) → Wall 2 2015, Wall 3 moved. Cupboards wider, 30 fillers kept (Mark): TC-02 / TC-03 975 → 977.5, kick 2015. Bulkhead WC-01 170 → 151 so the joinery stays at 2400.
- J03 2015 ticked. Lee "spout centre 342" → Mark: doors + sink centred 342 off Wall 3. BC-04 691 → 624 (1361-1985), new 67 filler BC-06 on the kick between BC-03 and BC-04, sink fixture moved to x 1483 (centre 1673 = 342 off Wall 3). 30 filler BC-05 kept.
- Katherine's hose / tap cut-outs (ticked by Lee) → Mark: Ø80. Back of BC-04 (taps) + BC-03 side panel and BC-04 LH gable to match (hoses), centres 400 AFL, side holes 100 off wall. Part cut-outs only machine horizontal parts so far → drawn as an elevation CAD note + circle and written in the cabinet notes: DRILL BY HAND.
- 2026-11-02 rev (Mark): 67 filler BC-06 deleted, sink cpbd BC-04 back to 691 running to end panel BC-03. Sink stays centred 342 off Wall 3 → OFF CENTRE to the doors; client note "SINK OFF CENTRE TO CABINET DOORS" on the J03 elevation (beside Wall 3) + plan (below the joinery). Ø80 hole note removed from the drawing (client copy) - holes stay in BC-03 / BC-04 cabinet notes for the workshop.
- J03 wall spout: Ø20 hole drawn on the Wall 2 elevation at 342 off Wall 3 (centre x 1673), ~1170 AFL as Lee sketched it (height not measured).

### Appliances schedule (38_Howard_Street_Appliances_and_Fixtures_Schedule_260927.pdf) — Kitchen J05, 2026-11-02 (Mark)
- Oven niche 600 kept (Miele says 590-595 - Mark: fine). Combi niche 450 OK. Wine fridge niche 522 OK.
- Cooktop → Miele KM 7373 FL 800, SURFACE mount, cut-out 760 x 490 (Miele range 750-780 x 490-500), re-centred on BC-05.
- Rangehood canopy WC-02 → 450 deep overall; Miele DA 2578 cut-out 670 x 370 centred in the canopy bottom (crv:bottom; code 42ce711 lets curved canopy bottoms take cut-outs).
- D/W → Miele G 5000 SCi semi-integrated: BC-18 door 600 high (REVT 200), edged all round, no handle (CleanSteel fascia above).
- Sink → Mondella double bowl 760 x 450 x 200 U/M (Bunnings 1056993), cut-out 730 x 420 R10, re-centred on BC-11. Mixer stays where it was.
- Fixture labels (drive the Appliances + Sinks spec block) set to the scheduled models: oven, combi, cooktop, D/W, sink, Yabby mixer.
- Open: SK02 alfresco sink - no alfresco room in this job. No fridge / washer / dryer models in the schedule.

### HOLD — Entry J01 Paperbark carcass (2026-11-02, Mark)
- Entry J01 carcass + shelves are LX Colour 16 Paperbark (room level; BC-01, TC-02, TC-05, WC-03 + their shelves / divider). Quote allowed Whiteboard internals only.
- Mark sending the client a variation. DO NOT CUT Entry J01 until it's approved. If declined → set the room interior + shelf materials back to Whiteboard 16.5.

### Living J06 — DONE 2026-11-02
- Wall 1 2570 (Lee, was 2575): cupboards TC-02 / TC-03 1022.5 → 1020, 500 curved end + 30 filler kept; bulkhead WC-02 + kick 2070.
- "Wall out of plumb - allow 12mm tag" (Lee) → Mark: +15 wall-end overhang (OL 15) on both curved pieces TC-01 + WC-01.
- Lee "will have slight quirk" at the curved end → client note with arrow on the plan.
- Wall 2 595 (Lee) → joinery 595 o/a (Mark): TC-01 / WC-01 595 deep, TC-02/03/04 + WC-02 + kick 577 carcass.
- Ceiling 2666 (Lee, was 2680) → bulkheads 280 → 266, joinery stays 2400.
- Services low in TC-03 by Wall 2 (Lee ✓) → no cut-out (Mark).
- Fronts: LX Colour 16 Desert Dune 2595, Natural (Katherine; already the room material) - spec block text updated.
- J06 elevation (Wall 1 face): '10mm SHADOWLINE' note with arrow to the bulkhead split rail (60 high, 10 set back, 2400-2460).

### Play J07 + J07M — DONE 2026-11-02
- Lee: all ticks (2386, 582 depths). Wrote "2375 ✓" on the J07 tall dim → Mark: ceiling 2475 stands but **TBC — CONFIRM FINAL CEILING BEFORE NEST**. Note "CEILING 2475 TBC / CONFIRM BEFORE NEST" on both Wall 2 elevations + job notes in the app.
- Katherine "flush finish / bulkhead flush at this end" → Mark: bulkhead WC-02 now runs over the desk-side 16.5 end panel (1546.5 long: J07 from 839.5, J07M 0-1546.5), end return flush with the panel's outside face; front flush with the doors; 10 shadowline split as J06 (fascia 65 + 60 MDF split rail, 10 shadow gap above the cupboards).
- Desk "Elegant Oak" (Katherine, Mark OK) → desk top WC-01, back rail WC-03, support panel BC-01 were already Elegant Oak (LAM01); notes corrected (said LAM03).
- 2026-11-02 rev (Mark): Entry J01 now **480 o/a incl. doors** (was 500). Carcasses / end panels / filler / kick / WC-05 480 → 460 (end panels follow cab.d + 20 = 480); top cap WC-04 + hat-bay shelf WC-01 500 → 480. "O/A DEPTH" plan dim now reads 480.
- 2026-11-02 rev 2 (Mark): J03 sink cpbd BC-04 now CENTRED on the sink + wall tap: 624 wide, 1361-1985 (centre 1673 = 342 off Wall 3), 30 filler BC-05 kept. Run pushed across with a new 49 scribe filler BC-06 at Wall 1 (to the floor, TOEH 0), keeping the 620 openings: BC-01 49, BC-02 687, BC-03 1325, kick 1343-2015; dryer x 77, washer x 715. "Sink off centre" client notes to be removed (no longer true).

### ROBES GENERAL — Bed 1, Bed 2, Bed 3 + WIR J11 (Mark 2026-11-02)
- Bulkheads flush with the doors AND the outside of the end panels (front 'doors', returns flush with the panel face).
- Bulkhead bottoms, faces and returns edged where seen.
- 10mm shadowline under the bulkhead (60 x 10 MDF split rail, 10 set back), mitred round the returns where there are returns.
- Top reveals 0 on all doors under a bulkhead (REVT 0).
- New code for this: the split rail now wraps a bulkhead return (bh:split_l / bh:split_r, mitred) - z_bulkhead B7.
- Bed 1 J09 + WIR J11: apply when those markups are done.

### Bed 2 J08 + Bed 3 J08 — DONE 2026-11-02
- Ceilings (Lee): Bed 2 2780, Bed 3 2775 (were 2770) → walls set; joinery stays 2400, bulkheads 380 / 375.
- Robes general applied to both: WC-01 now from 0 (Bed 2 1750, Bed 3 2150), front flush with the doors (410 / 600), left return mitred back to the wall, split rail mitred round it; TC-02 / TC-03 REVT 0 (doors 2300 full).
- Bed 2 "wall 25 out of level - 30mm scribe tag" (Lee) → Mark: TC-01 end panel +30 (440 deep) set 30 into the wall, front still flush with the doors. Back edge is still taped - untape if it's scribed on site.
- Bed 2 "front facing hanging rail" (Katherine) → Mark: special - 30x15 oval rail runs FRONT TO BACK under the fixed shelf, 20 off the back and the front (333.5 long), centred in TC-02. We fit and drill by hand. New interior option "Front to back (fit by hand)" (z_accessories A12). Elevation note now "HANGING RAIL / FRONT TO BACK".
- Bed 3 rail stays a normal side-to-side rail (580 deep).

### Bed 1 J09 — DONE 2026-11-02
- Lee: ceiling 2780 (was 2770) → walls set, bulkhead 380, joinery stays 2400; ticks on 2300 wall + 600 return. Small stray red mark right of the elevation - nothing readable.
- Katherine "bulkhead to finish flush with side" + robes general: WC-01 from 0, 2300 long, front flush with the doors (600), left return mitred to the wall, 10 shadowline split mitred round it; TC-02/03/04 REVT 0. Resolver clean.

### Storage J10 — DONE 2026-11-02
- Lee: ceiling 2770 ✓, 1868 / 580 / 950 / 482 / 400 ✓; "clears window" → bulkhead stays to Wall 2 (window in Wall 2, roughly 600-2190 AFFL off his hatch). Red "100" at TC-01 = the 100 kick height (Mark) - already 100, no change.
- Robes general applied (Mark): WC-02 from 0, 1868 long, flush with the doors + outside of TC-01, left return mitred to the wall, 10 shadowline split mitred round it; TC-02 REVT 0 (doors 2300).
- Low shelf "leave loose, max height 440" (Lee) → BC-01 422 + WC-01 18 top = 440. BOTH SUPPLIED LOOSE (cabinet notes + elevation note "LOW LEVEL SHELF / SUPPLIED LOOSE - MAX 440 HIGH / TO SIT BELOW WINDOW SILL"). Front already flush with the doors (Katherine "flush finish").
- TC-03 false front "removable for servicing" (Katherine) → Mark: done by hand on site, brackets as drawn; noted on TC-03.
- 2026-11-02 rev (Mark): TC-03 LH kick return - 18 LAM01 'Kick Return (seen)' 100 high x 60 deep on the void's left side, from behind TC-02's kick face (540) to the false front - seen through the recessed kick. L bracket 3 legs now start at 100 above it.

### WIR J11 — DONE 2026-11-02
- Lee: ceiling 2800 ✓ ("2500" on Wall 2 = 2800, Mark), BH 400 ✓, plan dims ✓, doorway "2400 ✓" (opening drawn 2040 - unchanged).
- Robes general applied: all three bulkheads front flush with the doors, 10 shadowline split; REVT 0 on WC-01, WC-02, TC-02, TC-05, TC-06, TC-09.
- Wall 2: WC-04 now from the outside of TC-01 (982, 2940 long), left return flush with TC-01's face + mitred to the wall, split rail mitred round it (Katherine "flush finish to edge of bulkhead/cabinet"). Filler BC-01 30 → 50 (blue note), drawers BC-02 952 → 932.
- Wall 4: bulkhead continues over the doorway (Katherine) - split at TC-07's LH edge (Mark): WC-05 0-2022 (no returns now), WC-06 2022-3922 (1900) over TC-07, the doorway, TC-08, TC-09; no returns.
- Exposed wires at TC-08 (Lee "box out") → 4 x LAM01 300 x 100 strips, edged all edges, SUPPLIED LOOSE - custom parts in TC-09, hidden from plan + elevation (box made after, on site).
- Light switch on the side of TC-08 (Katherine) → no cut-out (Mark); noted on TC-08.
- 2026-11-02 rev (Mark): WC-06 bottom return (soffit) under the open space over the doorway - LAM01 1170 x 582, from TC-07's LH edge to 100 into TC-09, butted behind the fascia, ends taped. New bulkhead option bottom from / to (z_bulkhead B9, 7947092).

### Master Store J12 — DONE 2026-11-02
- Lee: ceiling 2790 ✓, 1018 / 700 ✓. "Allow 10mm tag for scribe" at TC-03 → panel 500 → 510, set 10 into Wall 2, front still flush with the doors (as Bed 2).
- Katherine "flush face on this side (bulkhead/cabinet edge)" + robes rules (Mark): WC-01 0-1018, flush with the doors + outside of TC-03, right return mitred to the wall, 10 shadowline split mitred round it; TC-02 REVT 0 (doors 2300).

### ALL 13 MARKUPS (30/10/26) REVIEWED — 2026-11-02
Open: Entry J01 Paperbark variation (DO NOT CUT until approved); Play ceiling 2475 TBC before nest; SK02 alfresco sink scope; fridge / washer / dryer models; J03 spout height (1170 from the sketch); J03 "sink off centre" notes to delete; WIR door drawn 2040 (Lee "2400 doorway").

### Rev 2 issued (draft) — 2026-11-02
- Mark's answers on the open list: Entry variation going tonight; Play ceiling 2475 fine → bulkheads +10 for scribe (Play walls drawn 2485, WC-02 85 / fascia 75, elevation notes updated); alfresco not done yet - ignore SK02; fridge / washer / dryer models - ignore; J03 spout 1170 fine for now; J03 notes deleted (Mark); WIR door leave at 2040.
- Combined PDF: Shop Drawings Rev 2 02.11.26/RHK6581 - Lee Smith - Shop Drawings Rev 2 - 02.11.26.pdf (47 pages, 13 rooms, Line Drawing Print).
- Reply-all draft in Outlook to Calen's 01/11 email (cc Katherine, Lee, p.b.burke1981) - revisions room by room + Calen's site notes. Mark to attach the PDF and send.
- 2026-11-02 rev (Mark, before sending): "BULKHEAD FLUSH WITH DOORS - 10mm SHADOW BETWEEN" note with leader on every flush bulkhead elevation (Bed 1/2/3, J02, J06 (replaced the shadowline note), J07, J07M, J10, J11 Wall 2 + 4, J12). Bulkhead vertical cleats (bh:cleat_v) hidden in elevation on every straight bulkhead (part_hide_views). J01 "2400 O/A HEIGHT" dim, floor to top of WC-04. J02 bulkhead → robe rules (flush with the doors, 10 shadowline, TC-02/03 REVT 0). J10 WC-02 bottom return 500 wide from the RH wall (1368-1868) + TC-03 L brackets hidden in elevation. PDF re-exported as "... Rev 2 - 02.11.26 (updated).pdf" (the first was open).
- 2026-11-02 rev (Mark): Play J07 + J07M spec block - Panels line now 'LX Colour 16mm – Sunbaked Natural' (ABS grain removed) + 'Desk top + side panel against wall: Lx Elegant Oak 18mm'. All bulkheads: horizontal pieces behind the face hidden in elevation (bh:cleat_h, bh:ret_b; curved crv:top / crv:bottom on J06 WC-01 + kitchen WC-02). PDF re-exported - current file is 'RHK6581 - Lee Smith - Shop Drawings Rev 2 - 02.11.26.pdf'.

### Machining — ground floor (2026-11-05)
- Entry J01 HOLD lifted (Mark): internals (interior + shelf) changed Paperbark → **PT Colour Matt 16mm – Oyster Grey Matt** (new colour row `74898df6`, copied from Black Matt; face colour #b4b0a7 is a placeholder). Fronts / panels stay Elegant Oak.
- Entry J01 first run R2 left Top Cap 2519 + kick sub front / back 2502 unplaced → (Mark) WC-04 Top Cap split into 2 custom parts joined over TC-03's right face (x 536): left 536 (front + left end edged), right `cab.w - 536` = 1985 (front edged); comments 'JOIN … EDGE FRONT AFTER JOINING'. KICK 1 run → manual seams: face 834 / 1668 (unchanged), sub front 2400 + 102, back mirrored.
- Entry J01 = run **R5** (66 parts; Oyster Grey 7, Elegant Oak 6 (sheet 6 = one kick face piece, 3%), Whiteboard 1). All placed. R2 on the server moved to Entry J01/_superseded R2 (R4 local only).
- Living J06 = run **R3** (61 parts; Whiteboard 10, Desert Dune 4, MDF 10mm 1). All placed, no warnings.
- Server: \server\Data\CNCFiles\RHK6581 - Lee Smith - 38 Howard St, Grange\<room>\ (material sub folders + cut sheets / labels PDFs + .rhkrun).

### Rev 2 APPROVED — Katherine 2026-11-04 (email "REVISED Shop Drawings For Approval")
- Attachment "RHK6581 - Lee Smith - Shop Drawings Rev 2 - 02.11.26 - KB Approved.pdf": stamped APPROVED 4/11/2026 on Entry J01, Laundry J02 + J03, Kitchen J05 + Butler's J04, Living J06, Play J07 + J07M, WIR J11, Master Store J12. Robes (Bed 1 J09, Bed 2/3 J08) and Storage J10 not in the set — "robes will come tomorrow".
- Entry J01 plan: handwritten "oyster grey" → internals PT Oyster Grey Matt (done, see Machining). Spec block on the drawing still reads Paperbark — update it.
- Kitchen sheet 2 (plan) + sheet 3 (Wall 1): "5 x floating shelves as discussed. client to provide brackets". Sheet 4 (Butler's Wall 2, TC-06–TC-09 open talls) NOT stamped approved, note "5 x floating shelves as discussed" → butler's open talls become 5 full-length floating shelves (we supply shelves, Katherine sources brackets — her 2026-11-04 email). REDRAW BUTLER'S WALL 2 BEFORE CUTTING THE KITCHEN.
- Calen's site notes: J03 washer GPO moved clear of the gables (49–67, 687–705, 1325–1343); upstairs landing storage switch moved (KB to confirm dimension); island power for D/W + charging — electrician aware; delivery Tue 24th, street access noted.
- 2026-11-05 (Mark): Entry BC-01 (960 D2-SL, 2 drawers side by side + centre divider) → 2 separate single-drawer cabinets: BC-01 480 (536–1016, edited in place) + new BC-02 480 (1016–1496), same D2-SL settings, single drawer face (477 x 328), BC-02 in the KICK 1 run. Entry re-run as **R6** (70 parts, all placed, no warnings); R5 on the server moved to Entry J01/_superseded R5. Shop drawing Entry elevation now shows BC-01 + BC-02 — re-export if the client copy is needed.

## WC-02 rangehood canopy → built-in rangehood setup (2026-11-06)
Mark: set it up the same way as RHK6542 WC-01. WC-02 changed from BHCRVFIXP (curved bulkhead) to WCRVFIXP
(curved wall cabinet) with the Rangehood option on, so it builds the same way: Miele DA 2578 hole 670 x 370 in the bottom
(centred, setback 23 = 39 each side front/back), 1 support rib under the shelf split L/R of the hole, rangehood rails
either side, shelf rib at 350 with the flue box (200 x 250, default) above. WALLZ 1500 keeps the underside where it was
(2509 wall - 1009). The hand-entered bottom cut-out was replaced by the rangehood hole. Backup row in
_bak_rhk6581_wc02_20261106. Open: shelf height 350 + flue 200 x 250 are defaults, check against the DA 2578 sheet;
4 ribs leave 194 between supports (kit wants < 170).
- 2026-11-06 flue box now built in segments rib to rib (code change 4a4118a): shelf→rib 3, rib 3→rib 4, rib 4→top,
  each ~194 high, so each front cover comes off between two ribs. Ribs above the shelf take the 200 x 250 flue notch only.
- Miele DA 2578 docs saved to \server\Data\_JOBS\RHK6500 - 6599\RHK6581 - Lee Smith- 38 Howard St Grange\APPLIANCES
  (AU/NZ op + install manual, installation plan, data sheet, install drawing). Manual p33: cut-out 670 x 370, back edge
  25 from the back of the cabinet bottom (ours 39), bottom 16–35 thick; body 293 + 30 spigot above the 3 mm lip
  (~326 from the underside, our shelf rib at 350 clears it); Ø150 outlet on top, centred, ~100 in from the cut-out back
  edge (fits the 200 x 250 flue notch); can go out the rear. p35: min 600 over electric (650 recommended, p36).

## Butler's Wall 2 → 5 floating shelves (Mark 2026-11-06, per KB-approved set "5 x floating shelves as discussed")
- Removed TC-06 (30 filler), TC-07 / TC-08 (796 open talls), TC-09 (33 filler), WC-06 (30 white BH) and KICK 3.
  Rows backed up in _bak_rhk6581_butlers_w2_20261106 (+ _bak_rhk6581_kick3_20261106).
- New FLSHLF WC-06 … WC-10, PT Classic White Matt 16 double (33 thick), 1660 long (wall 1655 + 5), 386 deep,
  square ends — right end scribed to the R474 curve on site (Mark). 5 equal clear gaps of 375.3 floor (0) to ceiling (2417):
  undersides 375.3 / 783.7 / 1192 / 1600.3 / 2008.7. Client supplies the brackets (KB 4/11).
- New BC-19 BEPF 18 end panel (copy of BC-15, 580 x 900) on BC-16's right side, 386–404 off Wall 2; shelves 386 deep
  meet its outer face (Mark: panel 900, shelves 386). BC-16 right neighbour = end panel.
- Open: FLSHLF still has our cleat + back/side rebates — check against the client's brackets. Benchtop 3 still starts
  at 400 off Wall 2 (end panel face at 386).
