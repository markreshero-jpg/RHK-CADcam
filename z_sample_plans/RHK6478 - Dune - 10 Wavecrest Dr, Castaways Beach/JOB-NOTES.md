# RHK6478 Dune - 10 Wavecrest Dr, Castaways Beach

Project `fa0884a2-abd1-4370-adfa-a30044e88ef2` (defaults cloned from RHK6590: 2 Pac Flat 18mm). 2pac colour = "2 Pac - Colour TBC" (new row on the 2 Pac Satin 18mm range, 2026-10-31) until the client picks — swap the project base/wall/tall colour ids then.

## Sources
- Client markups 26.10.26: `G:/My Drive/6. Resident Hero Work/3. JOBS/Res hero - Biggie/RHK6478 - Dune - 10 Wavecrest Dr, Castaways Beach/Mark ups with Cleint 26.10.26/` (4 scans, 32 pages + DS TV Unit)
- Site measure 22.10.26: `C:/Users/mark/SynologyDrive/_JOBS/RHK6400 - 6499/RHK6478 - Dune - 10 Wavecrest DVe Castaways/SITE CHECK MEASURES/Site measure 22.10.26.pdf`
- Older: Mark ups with client 02.09.26, MEETING SPEC NOTES (email 11 May 2026), CV Drawings / Drawing Pages REV A

## Job-wide decisions (Mark, 2026-10-31)
- Rooms drawn one by one, from the site measure (F/P = finished plaster, use as is).
- Fillers stay 30; cupboards shrink/grow to the site size.
- Ceiling heights are off slab: deduct a **20 floor allowance (TBC)** — on every spec block.
- Kick 100.
- Laundry talls: 500 overall incl doors.
- Master WIR: walls per site measure, plan markup to be walked through with Mark (involved).
- DS Hallway (483 x 605, next to PDR) = DS Linen. Tundish 1652-1722 high, 45-180 in: show in CAD on the elevation; shown in CAD on the elevation only - no cut-out (Mark 2026-11-01).
- TV unit: later.
- Handle schedule "Push To Open" (all roles -> PTO product) created this job; set per room where PTO.

## Rooms
| Room | Room id | Status |
|---|---|---|
| US Hallway Linen | b6377e60-bed3-4e5c-af80-7ea320db6ff5 | Drawn 2026-10-31, 0 errors. 1597 site: TFKW 30 / T2D 1025 pair / T2D 512 single (hinge R) / TFKW 30. 2674 incl 100 kick, 18 shadowline to 2692. adj / fix (top 1000 AFFL) / adj x3. 4 hinges per door [2474, 1880.5, 1000, 100] (Mark). Both T2Ds split in height at 898 (3 under the fixed shelf top 901, split tool rule): sides + back in two, doors whole. Check pending. |
| DS Linen | f1953ab4-a03b-4439-a777-d39476156f31 | Drawn 2026-11-01, 0 errors. 483 site: TFFW 30 / T2D 423 single door (hinge R) / TFFW 30. Whole run lifted 150 off the floor (pos_z 150, Mark: robo vac drives under) - carcass + fillers 2231 high, top 2381 (CH 2419 off slab − 20 floor − 18 shadowline), 600 OA (580 carcass). No kick, NO bottom (Mark 2026-11-01: open underneath; case_bottom removed = not made), back runs down to the gable bottoms (BOTTOM_BACK_JOIN butts_into_back), gables + back taped on their bottom edges (cabinet EDGING override = shop schedule + bottom on gables + back). Door full carcass height. 5 adj shelves. Hinges [2129, 1660, 922, 100] clear of the shelf holes. Tundish 1652-1722 H, 45-180 from the LH wall (Mark confirmed) drawn on the Wall 2 elevation only - NO back cut-out; note off the cupboard with a leader. CAD: 150 dim + "150 GAP FOR ROBO VAC". Push To Open room schedule, PTO note at the left edge. Check pending. |
| US Broom | 02ce23c0-9b53-454f-8bcf-f0f81daa1dc8 | Drawn 2026-11-01, 0 errors. Copy of the DS Linen (Mark). 481 x 714 site: TFFW 30 / T2D 421 single door (hinge R, PTO) / TFFW 30. 700 OA incl door (680 carcass) - CAD note "fit fillers 2mm back from wall". Whole run 150 off the floor (pos_z 150, dy 2526, top 2676 = CH 2714 off slab − 20 floor − 18 shadowline). No kick, no bottom (open underneath), back to the gable bottoms, gables + back taped on bottoms. 6 adj shelves. 4 hinges (Mark) [2426, 1613, 896, 100] clear of the shelf holes. CAD: 150 robo vac dim + note, PTO tag, spec block. Check pending. |
| Bath Linen | f98db01e-14e2-454d-8c80-a48567bcc20e | Drawn 2026-11-01, 0 errors. Site 1036 x 602, **CH 2400 TBC** (Mark). **Width TBC: final measure after tiling.** No fillers: T2D 1030 at offset 3 = 3 shadowline each wall, doors flush with the carcass sides (REV* 0), 3 gap between the doors (GAPC 6 - the rule is 2 x the gap). **Mirror doors**: room tall style "Mirror Door" (new, z_faced_doors) = 16.5 Whiteboard cut on CNC + 4mm mirror cut to size, stuck on face (Glass Order report lists the mirrors). 600 OA -> 577.5 carcass. 2382 incl 100 kick, 18 shadowline. 4 shelves equally spaced, 2nd up fixed (fixed top ~1023 AFF). 5 hinges per door (mirror weight) [2182, 1600, 1000, 640, 100]. Handles: room schedule "Lip Pull 50 Brushed Nickel" (new product, not drilled - HANDLE_DRILL off on the room), on the meeting edges ~1120 AFF (height TBC). Kick colour still the job default (TBC). No height split (not asked). Check pending. |
