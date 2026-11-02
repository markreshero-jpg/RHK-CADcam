# RHK6563 Costello - 3/33 Elanda St, Sunshine Beach

Project `416bf6cf-9681-4462-b93d-6ecac19e015b` (created 2026-11-02, defaults cloned from RHK6478: 2 Pac Flat 18mm, colour TBC — swap to the finishes below once the boards are in the library).
Builder: Costello Building Projects (Nathan Costello, nate@costellobuildingprojects.com.au). Client: Christine & Ian.

## Sources
- Site measure: `\\server\Data\_JOBS\RHK6500 - 6599\RHK6563 - Costello - 33 Elanda St Unit 3\SITE CHECK MEASURES\RHK6563 - Costello - 33 Elanda Site Measure.pdf` (2 pages, hand sketch)
- Email thread "COSTELLO RHK6563 - 3/33 ELANDA ST SHUNSHINE : CHRISTINE - ELANDA" (Charlene 10.09 / 14.09 / 26.10, Nate reply 02.11.26)

## Finishes (Nate, email 02.11.26 — supersedes the 14.09 list)
- **Study**: all Laminex Tasmanian Oak — benchtop, shelving and cupboards. (14.09 had cupboards + O/H shelves Polytec Antique Matt; Nate now says all Tas Oak.)
  Handles: Momo Dallas 128 DBR (14.09 list).
  "Cupboards she only wants 500mm wide (I think Mark had 700mm)" — see questions.
- **Vanity**: Polytec Antique White Matt. Top 20 stone Ambassador White Burst. Over-mount bowl.
- **Laundry**: all Polytec Antique White Matt.
- Library: neither Polytec Antique White Matt nor Laminex Tasmanian Oak exists yet (checked 2026-11-02).

## Site measure read (2026-11-02)
### Study — CH 2155
- Walls: 2044 (long), 1431 and 1433 returns.
- L-shaped bench 750 H finished along the 2044 wall + 1431 wall, 600 bench; ~575 deep noted on the 1431 run; BEPF seen end at the open end of the 1431 run.
- Open shelf above the bench (marked "open sh"): 300 deep, 370 H O/A, made from 33 board.
- At the 1433 wall corner: 750 wide `D3-SLL` with `W2D` above (tall bank beside the desk).
- "400 Desk" noted by the 1433 wall.
### Bathroom vanity — CH 2237 F/T/P
- 1456 wall between 765 returns; 1000 wall beyond; 500 bench depth.
- Floating, 300 H off floor. `D2-LL` | `B1D` (over-mount bowl centred) | `D2-LL`.
- Dashed lines either side = side-mount shaving cabinets, 1100 H off floor to ceiling, doors on each.
- Power for LED driver on the left wall.
- Plumbing: water 600–840 off left, 530 H off floor; waste 940 from left, 440 H off floor.
### Laundry — CH 2213, cornice 55
- Wall A 845, Wall B 1327, 1261 wall; void / duct 339 x 418 in the corner; 396 return; 477 back of architrave to wall A; door way 930, 200 nib; light switch on the door side.
- Angled plinth top line dashed across. **No cabinets sketched.**

## Open questions (for Mark)
1. Study cupboards 500 wide — which ones (the 750 D3-SLL / W2D bank → 500, or the depth)?
2. Study 575 vs 600: bench 600 deep, carcass 575? Desk 400 — kneehole width or desk depth?
3. Study open shelf 300 deep x 370 H, 33 board — fixed to wall how, one shelf or a box?
4. Vanity shaving cabinets: width/depth of each, mirror doors?
5. Laundry: no cabinets on the sketch — layout to come (quote drawings?)
6. Board thickness for Polytec Antique White Matt (16 / 18) and Lx Tasmanian Oak; kick height.

## Answers (Mark 2026-11-02)
- Study tower 500 wide OA, 1 door upper (W1D) from bench height to ceiling less a 30 bulkhead; cupboard under it 750 OA high.
- "400 Desk" = the desk depth on the back-wall run, so the tower beside it is 400 OA deep incl doors.
- Open shelf = a box with top, bottom and back, 33 LX board to match.
- Vanity shaving cabinets 140 OA deep incl mirror doors.
- Laundry: later.
- Boards: 16mm (Polytec Antique White Matt); Lx Tasmanian Oak ABS grain 18mm.

## Library added 2026-11-02
- Colour "Tasmanian Oak" on the Laminex 18mm ABS Grain range (`b5a28e84`), board `LX Abs Grain 18mm – Tasmanian Oak` (`6cd37f1b`).
- New board family `LX Board 33mm` + `LX Board 33mm – Tasmanian Oak` (`a92331d4`) for desk tops / shelf boxes (per-cabinet `material_overrides.exposed`).
- Handle `Momo Dallas 128` (finish DBR, length 140 assumed) + schedule `Momo Dallas 128 DBR` (`463951c9`).
- Edge tape `LX Abs Grain 1mm Matching 40 – Tasmanian Oak` (`6026c6b4`, width 40 TBC) matched to the 33 board.
- Polytec Antique White Matt 16mm NOT added yet (vanity / laundry).

## Rooms
| Room | Room id | Status |
|---|---|---|
| Study | 443a1553-14c4-4b8d-bd1f-2e5890b827e7 | Drawn 2026-11-02, 0 errors (layout `z_plan_automation/layouts/rhk6563-costello-study.json`). Walls clockwise: 1 left 1433, 2 back 2044, 3 right 1431, CH 2155, kick 100 (TBC). Tower in the Wall 1/2 corner, 500 OA x 400 OA deep (380 carcass): TFKW 30 / D3-SLL 452 (750 OA incl kick, joined KICK 1) + W1D 452 single door hinged left 750-2125 (hinges [100, 900, 1275] clear of the shelf holes) / TEPF 18 floor to 2125; BH 30 to the ceiling, flush with carcase, right return 380 mitre. Desk tops 33 LX Tas Oak (WUP) top 750: Wall 3 600 x 1431 into the corner, Wall 2 400 x 944 TEPF to the Wall 3 top. BEPF 18 x 575 deep at the open end (sketch "575"). Open shelf boxes (Mark rev 2026-11-02): 2 real boxes BC-03 / BC-04 (B1D open, no front, no shelf, FLOAT), 300 deep x 370, bottom 1400 AFF (1400-1770), every part 33 LX Board Tas Oak via material_overrides interior/exposed/shelf, taped with LX Abs Grain 1mm Matching 40 Tasmanian Oak (matched to the 33 board). Wall 2 box 1544 from the TEPF to the corner, both ends. Wall 3 box 1164 at 267, left end removed (not made) so top/bottom start at 300 against the Wall 2 box; right end seen. WIDE_CABINET warning on the 1544 box (no partition, as asked). Room fronts + exposed = Lx ABS Grain 18 Tas Oak, kick face Tas Oak, handles Momo Dallas 128 DBR, carcass default whiteboard. CAD: spec block + SITE NOTES (Site notes layer) + shelf / desk notes. Mark confirmed: kick 100, D3-SLL drawers under the 1-door upper, carcass whiteboard. **TBC: BEPF 575 vs 600.** Check pending. |
| Bathroom Vanity | – | Not drawn |
| Laundry | – | Not drawn |
