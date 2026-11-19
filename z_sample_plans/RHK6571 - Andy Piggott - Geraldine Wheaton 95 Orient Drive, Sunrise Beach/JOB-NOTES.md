# RHK6571 Andy Piggott - 95 Orient Dr, Sunrise Beach (granny flat, Geraldine + Pete Wheaton)

Project `063b0eab-a769-4b7d-a93c-d73ed639b3d1`, room **Kitchen** `5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3`.

## Sources (SynologyDrive `_JOBS\RHK6500 - 6599\RHK6571 - Andy Piggott - 95 Orient Drive\`)
- `ARCHITECTURALS\Marked up Drawings.pdf` - Mark's markup on the Bunnings V2 set (El A 3D, El B, El C, countertops).
- `ARCHITECTURALS\Plan View.pdf` - the Bunnings plan (El A run between fridge and stairs).
- `SUBCONTRACTOR QUOTES\STON EPLAN ...pdf` p4 - same plan as vector; scaled from it at 11.44 mm/pt (1545 / 2500 / 800s check).
- `QUOTES\QUOTE RHK64571 ISSUE NO 1 ...pdf` - 20 stone Ambassador Dapple White, 3 waterfalls, PT Classic White Matt, Dragon Pro, Blum, set back SQ edge finger pulls, door bin 400 (dropped per markup), cutlery tray 450.
- No site measure yet - Mark measuring the week of 2026-11-16.
- `APPLIANCES\` - Geraldine's spec sheets (her email 12/11/2026 3:11pm, saved 2026-11-16): Westinghouse WRR626SB rangehood, Abey RHH6 ducting kit, Fienza Kuro 68612 sink, Linkware Elle mixer (photo), Bosch HBA574EB3A oven, Bosch PKE611BA2A cooktop, LG XD4B24PS DW.

## Mark's answers (2026-11-11)
1. Kick 140. 2. All overheads the same height; CAD dim floor -> top of overheads on each elevation (2190, under the beams).
3. Base carcass 575 (finger pulls, 5-7 overhang). 4. Overheads 330 + doors. 5. Our blind corner + 40 filler off it.
6. Corner overhead = base corner (BCNP) with a full top + wall construction -> new library `WCNP` (z_cabinet_shape L6).
7. D/W freestanding, 610 opening, model TBC. 8. Top mount double bowl sink, model TBC.
10. Rangehood ARBC60TBS: specs not found online (2026-11-11), drawn as `WRH`, hole TBC.
12. Extra 20 waterfall on El A (fridge end) - variation. 13. Site measure next week.

## As drawn (layout `z_plan_automation/layouts/rhk6571-piggott-kitchen.json`, post `_tmp-6571-post*.mjs`, CAD `_tmp-6571-cad.mjs`)
- Walls: 1 corridor west 1544, 2 north 5727 (= **El A**), 3 alcove south 1785 (= **El C**), 4 alcove west 2500 (= **El B**), 5 corridor south 2210. Ceiling drawn 2400 (TBC). Beams @ 2190 at x 1491-1622 and 3504-3636 (CAD).
- 880 incl 140 kick + 20 stone = 900. Overheads 720 incl 16.5 under panel (set back 20), 1470-2190, no handles, no bulkheads.
- El B: BC-04 BCNR/L 1300 (false panel 633.5 = 575 + 16.5 + 2 + 40, door 661.5, rails on edge, sink over), BEPF, 610 D/W space, BEPF, BC-07 D4-SSSL 450, WF end at 2413. Overheads WC-04 WCNP 600 x 633.5, WC-05/06 W2D 900, WEP.
- El C (from the east end): WF end at 381.5, BC-01 B1D 150, BC-02 UBO 600 (cooktop over), BC-03 BFKW 40 off the blind. Overheads WEP, WC-02 W1D 150, WC-03 WRH 600 lined up on the oven. The Bunnings 18 panels between the modular overheads / oven + 150 were dropped.
- El A: BC-08..10 D2-LL 800 (6 equal drawers) **475 carcass** on a 500 top (markup said 460 - with 16.5 fronts that is a 21.5 overhang, so 475 for 6.5; clouded, confirm). WF ends both sides (1499-1519, 3919-3939). Overheads WC-09..11 W2D 800 + WEP each end. Fridge (by owner) 830-1499.
- Tops: Benchtop 1 (El A 2440 x 500), 2 (El B 600, through the corner), 3 (El C 803.5). Square edge, 4 x WF mitre.

## Round 2 answers (2026-11-11)
- El A 475 carcass confirmed (cloud removed). Ceiling 2400 fine for now.
- Rangehood stays TBC - in the Appliance spec block, no hole in WC-03 yet.
- Sink placed: Abi Zalo double bowl stand-in resized to 640 (cut-out 610), label "Top mount double bowl sink - model TBC", centred on BC-04's door (Wall 4 offset 966.75), rim on the top (z 695, drop 205). Room fixture `99782f3f`.
- Spec block rewritten from the library template (colours only, template order, live fields) + Appliance spec block under it; SITE NOTES moved below.

- Beams drawn as room fixtures, same as RHK6586 Bed 1 Robe + Study: catalog "Plasterboard box (beam / bulkhead)" on Wall 2 (rot 0), z 2190 (underside), 210 high to the 2400 ceiling, wall colour. West beam x 1491, 131 wide, 1544 into the room (to Wall 5); east beam x 3504, 132 wide, 4044 (to the alcove's south wall, over WC-01/WC-02's end). Positions + widths scaled from the Bunnings plan. The plan's dashed CAD lines were replaced by these; labels kept.

- El A drawers to 450 (Mark): BC-08..10 `SCRBK 0` + `SLIDE_SETBACK 0` -> internal 458.5, so the picker can take the Dragon Pro 450 (8.5 behind it). Scribe out alone gives 438.5 - not enough. Needs a re-resolve: `node z_plan_automation/_tmp-6571-reres.mjs "BC-08,BC-09,BC-10" "BC-08"` (no-op dz, safe on the joined KICK 2).

## Andy's reply to the shop drawings (email 2026-11-11 2:55pm, cc Tim) - NOT applied yet
Mark: hold until after the site measure (week of 2026-11-16), then do it all in one revision.
- **Sink -> UNDERMOUNT, SINGLE BOWL** (was top mount double bowl). To do: swap fixture `99782f3f` for an undermount single bowl (model still TBC), update the plan / El B sink clouds + Appliance spec block text, check the top cut-out (undermount = polished cut-out in the stone).
  - Mark 2026-11-11: undermount confirmed. **QUOTE TO UPDATE** - Issue 1 priced a top mount sink; re-price for the undermount (polished stone cut-out) along with the El A waterfall variation. Keep it on the site-measure list - confirm sink model + position on site (week of 2026-11-16), then do the quote + drawing revision together.
- Extra waterfall end (El A fridge end) = extra charge: Andy has accepted the variation.
- Andy is checking the rest of the drawings and will reply by early morning 2026-11-12. Add his further comments here.
- Still no models for D/W, oven, cooktop, or the ARBC60TBS spec sheet.

## Appliances applied (2026-11-16, Geraldine's specs) - script `_tmp-6571-appl.mjs` + `_tmp-6571-appl-fix.mjs`
Andy is off the job (Mark 14/11): RHK supplies + installs, Geraldine + Pete did the rip-out 14-15/11. Geraldine's son's family arrives 8/12 - temporary benchtop OK if needed.
- New library rows (stand-in 3D models, notes say which): Fienza Kuro 68612 sink, Linkware Elle mixer, Bosch HBA574EB3A oven, Bosch PKE611BA2A cooktop, LG XD4B24PS DW.
- Sink fixture `99782f3f` swapped in place -> **Fienza Kuro 68612 granite single bowl, Matte Black, UNDERMOUNT** 540 x 440 x 215, cut-out = bowl 500 x 400 R10, centred on BC-04's door as before (room y 3077.3), 80 off the wall. Mixer (Linkware Elle, gooseneck 390 high) behind it, hole ~45 off the wall.
- Oven fixture `1f6e267e` swapped in place -> Bosch HBA574EB3A (niche 585-595 H x 560-568 W x 550 D; BC-02 opening 600 H x 567 W, 575 deep).
- Cooktop added on BC-02: Bosch PKE611BA2A 592 x 522, cut-out 560 x 495, 52.5 back / 52.5 front.
- DW added in the 610 space: LG XD4B24PS freestanding 600 x 600 x 850 (880 under the top).
- Appliance spec block now uses {ovens} {cooktops} {dishwashers}; rangehood line typed (no rangehood fixture, per the WRH convention). Cooktop + DW TBC clouds removed; sink cloud now "position TBC on site"; rangehood cloud "cut-out + duct TBC". SITE NOTES moved down to y 3700.
- Mark 2026-11-16: duct runs ABOVE the rangehood cabinet (no duct work in it); oven opening 600 x 600 OK; mixer = our **standard gooseneck** (Abey Lucia library item), spec line "Standard gooseneck mixer" (`_tmp-6571-appl-tap.mjs`; one-off Linkware Elle library row set inactive).
- Mark 2026-11-16: build a **generic slide-out rangehood** library item, reusable for all slide-out models -> WC-03 gets it once built.
- **WC-03 = slide-out rangehood** (new library `WRHSO`, z_rangehood R12, `_tmp-6571-wc03-so.mjs`): Bottom Type none, doors 678 from 42 up (40 open row + 2 reveal, the WRR626SB's 40 visor slides out under them), hood body full width between the gables x 300 deep -> under panel WC-13 notched 567 x 280 from its front (30 strip left at the back), shelf at 300 (hood 272 high), flue notch + box as WRH. Stainless visor as supplied. El C cloud removed, plain note "SLIDE-OUT RANGEHOOD / WESTINGHOUSE WRR626SB"; spec block "Duct above the cabinet - by others".

## Open
- Site measure (all sizes from the Bunnings plan). On site: undermount single bowl sink - model, position over BC-04.
- Quote update: undermount sink cut-out + El A waterfall variation.
- Beam positions / widths / ceiling (beams 210 deep only because the ceiling is drawn 2400).
- Check WC-03 (WRHSO) in 3D + the WC-13 notch on the cut list.
- Check Benchtop 2 / 3 get the sink + cooktop cut-outs (fixtures linked to BC-04 / BC-02 2026-11-16).
- Check WCNP WC-04 (new library item) + its L under panel WC-16 in 3D / cut list.

## Site questions (2026-11-18, `_tmp-6571-site-questions.mjs`)
- SITE QUESTIONS box (14 items) on the plan, Questions for Client layer, under SITE NOTES (x 6330, y 4690) - for Mark's site visit 2026-11-18. Answers -> update the room in place.

## Rev 3 - site measure 2026-11-18 (Mark's pen markups in the room + his answers) - `_tmp-6571-rev3.mjs` + `_tmp-6571-rev3-cad.mjs`
Backup of every touched row before the run: session scratchpad `rhk6571-rev3-backup.json` (not kept).
- **El A** 3977 wall to stairs - cabinets as drawn (Mark: "this run is good").
- **El B** 2448 o/a (to the outside of the waterfall): BC-07 450 drawers deleted; BC-04 blind corner 1300 -> **1785**, now blind 633.5 | door | door (hinges outside); BC-05 end panel at 1785, **D/W 610 at 1801.5-2411.5**, BC-06 end panel at 2411.5 = the panel the waterfall end glues to (Mark asked for one - BC-06 is it). Benchtop 2 north end 1631 -> 1596. Overheads WC-05 / WC-06 900 -> 917.5, WC-07 at 2435, under panel WC-14 1835 (end line 3.5 past the WF, as before). BC-04 warns WIDE_CABINET (1785 > 1200) - one carcass as a blind-corner sink cabinet; adj shelf spans 1750.
- **Sink** -> Fienza Kuro **68613** double bowl U/M, Matte Black, 762 x 457 x 220, bowls 341 + 30 + 341 x 406 (cut-out 712 x 406 R15), new library row (Abi Zalo double bowl 3D stand-in); centred on the BC-04 door pair (offset 1209.25, room y centre 2834.75), 80 off the wall; inside the carcass 828-1590 from the corner (clear of the blind). Sink clouds removed (position confirmed). Spec sheet saved to APPLIANCES (jpg). Geraldine also ordered the Coriander sink mixer (NCP 16/11) - Mark 2026-11-18: mixer is fine as drawn.
- **Overheads 710 high, tops 2180** (room wall_cabinet_top 2180; underside stays 1470); 2190 dims -> 2180. Beams / ceiling as drawn.
- **BC-09 inner cutlery drawer**: top drawer main box Dragon Pro 450x178 Silk White, inner drawer 450x95 Silk White at y_position 579 (box 593 up, 23 over the main box).
- **WC-03 duct out the back wall** (El C brick line 2000 AFF, duct below it): new rangehood `duct: { out: 'back', dia: 200, h: 385 }` (z_rangehood R13) - 200 hole in the back, centre 1855 AFF (1755-1955), no flue notch / box; shelf_h 300 -> 500 (above the hole). Doors 668. Spec block: "Duct out the back wall (200 hole in the cabinet back) - by others".
- SITE NOTES rewritten; SITE QUESTIONS box marked answered (mixer still open). Mark's pen markups left in place.
- Mark 2026-11-18: BC-04 adjustable shelf deleted (`_tmp-6571-bc04-shelf.mjs`); El B overall incl the waterfall end = 2448 confirmed on the plan BENCHTOP dim row. Quote update: Mark doing it.
- Mark 2026-11-18 "join kicks": BC-04 is the only kicked cabinet on El B (BC-05 / BC-06 panels to the floor), so it became its own kick assembly **KICK 3** (Detach kick; new bridge method `detachKick`) - `_tmp-6571-kick3.mjs`.
- Mark 2026-11-18: overheads **600 clear over the bench**: underside 1500 (bench 900), tops 2180 -> 680 high incl the 16.5 under panel; under panels pos_z 1500 (`_tmp-6571-oh680.mjs`). WC-03 duct hole centre 380 up (1780-1980 AFF, hood top ~1773, brick line 2000), doors 638.
- WC-03 `rangehood` was re-saved from an app tab on pre-R13 code mid-session: duct setting dropped and **shelf_h 170** (was 500). Duct put back (`_tmp-6571-duct-fix.mjs`); shelf left at 170 - asked Mark (it sits inside the 273 hood height).
- 2026-11-18 approval drawings: Line Drawing Print, plan at **1:25** (1:20 cut the El C dim rows), plan blocks re-spaced for it (`_tmp-6571-sq-move.mjs`: appliances y 2050, SITE NOTES 4150/1600, SITE QUESTIONS 4230/2450 width 76). Mark's 11 un-layered pen strokes -> new job layer "Notes for Ai" (print off); the rest are on Site measure (print off). Saved `PDF\Drawings to be Approved\RHK6571 - Geraldine Wheaton - 95 Orient Dr, Sunrise Beach - Shop Drawings Rev 3.pdf` (6 pages); the 11/11 draft moved to `_Superseeded` (dated). Reply draft to Gerry in Outlook (Mark attaches the PDF).
## SIGNED 2026-11-19 - Rev 3 approved
- Gerry signed Rev 3 (signed + dated sheets 1 and 6, no markups/changes) + the Issue 1 quote. Saved `PDF\Approved Plans\RHK6571 - Geraldine Wheaton - Kitchen Shop Drawings Rev 3 - SIGNED 20261119.pdf`.
- Stone: Axxon PO RH15448, template booked 01.12.26.
- **Bin**: Gerry wants one -> Mark 2026-11-19: **2 x 15 L pull-out bin behind a door** in BC-04 (sink cupboard). Hardware model TBC; add to quote/ordering.
- **Rangehood** WRR626SB dropped at the workshop 2026-11-19 -> measure the real unit, then tweak WC-03 (hood size, WC-13 notch, shelf_h still 170, duct hole, doors 638) BEFORE nesting.
- **WC-03 rangehood fit** (Mark 2026-11-19, spec: 555 x 230 body on a 600 x 42 base; `_tmp-6571-wc03-cover.mjs`, `-wc03-hinge`, `-wc13-short`): gables start **42 up** (SCRBT 42) so the 600 base fits under them; shelf on top of the hood **shelf_h 275**, U notch 200 x 213.5 from the back, centred (Mark's sheet CAD); **duct cover** = custom parts, 2 sides 16.5 at x 183.5-200 / 400-416.5 x 213.5 deep + front 233.5 at z 230-246.5 (front edged both long edges), shelf top 291.5 -> top 663.5; lower hinges 250 -> 300 (cleared the shelf). Duct hole stays 200 dia centre 380 - its "runs into the fixed shelf" warning is a false alarm (the hole sits in the shelf notch). Backup of the row: session scratchpad `wc03-backup.json`.
- **WC-13 under panel 750 -> 150**: stops under WC-02, nothing under the rangehood (Mark); WC-16 carries on under WC-04.
- **BC-09 inner drawer** front 581-694 ran 4 into the top drawer's finger rail (690): Lock Y 579 -> 570 (front 572-685, 5 clear). New error INNER_DRAWER_RAIL_CLASH flags this (z_handles).
- **KICK 1** (El C) stopped at 2803.5, 58.5 short of KICK 3's face (2745) at the corner: TOESCR -58.5 -> 848.5 long, butts KICK 3's face (KICK 3 runs through to the wall under the blind).
- **Overheads 330 -> 300 deep carcasses** (Mark 2026-11-19, `_tmp-6571-oh300.mjs`, backup session scratchpad `oh330-backup.json`): WC-01..03, 05..12 dz 300 (end panels too); WC-04 WCNP legs leg_back / leg_side 300 (doors now 277.5 + 311); under panels WC-13/14/15 dz 280 (set back 20), WC-16 L outline on 280; WC-03 hood body depth 283.5 (inside the back), shelf 283.5 deep, duct cover unchanged (front face 246.5 from the back, 53.5 behind the doors). Hood is 300 overall incl. its visor -> visor front about flush with the door faces; check on the unit.
- Before the machine: pre-release checks (WC-04/WC-16, BC-04 wide carcass, BC-08..10 450 drawers re-resolve, BC-09 inner drawer, KICK 3), then production run.

- Mark 2026-11-18: no site notes / questions on the PDF, specs only: job layers Site notes + Questions for Client print off; beam labels, the 2180 dims and the El B sink note moved to General so they still print. Rev 3 PDF re-saved (same name).

## Production R1 - 2026-11-19
- Optimiser run **RHK6571-R1** (Kitchen, all 173 parts, Best): Whiteboard 16.5 11 sheets (88%), PT Colour Matt 16 Classic White Matt 5 sheets (83%), all 2415 x 1211, nothing unplaced. Mark checked Stage 5. 7 panels / filler taped all 4 edges - Mark: leave as is.
- CNC: `CNCFiles/RHK6571 - Geraldine Wheaton - 95 Orient Dr, Sunrise Beach/Kitchen R1/16mm Whiteboard` + `/16mm PT Classic White Matt` (programs, cut sheets, labels 173, .rhkrun).
- PDFs in `_JOBS\...\PDF\Production`: `RHK6571 - Geraldine Wheaton - Kitchen.pdf` (shop drawings 1:25, 6 pages), `... Kitchen KICK PLAN.pdf`, `... Kitchen HARDWARE PICK LIST.pdf`.
- Bin: Mark buying a 2 x 15 L pull-out from Bunnings (not on the pick list).
