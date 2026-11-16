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
- NOT done: WC-03 rangehood hole (still null) - WRR626SB slide-out body 555 W x 280 D x 230 H (272 with visor), 600 x 40 front; Abey RHH6 = HORIZONTAL 150 duct out through a wall, so the WRH flue notch up through shelf + top may be wrong. Asked Mark.

## Open
- Site measure (all sizes from the Bunnings plan). On site: undermount single bowl sink - model, position over BC-04.
- Quote update: undermount sink cut-out + El A waterfall variation.
- Beam positions / widths / ceiling (beams 210 deep only because the ceiling is drawn 2400).
- WC-03 -> generic slide-out rangehood cabinet (to build) for the WRR626SB.
- Check Benchtop 2 / 3 get the sink + cooktop cut-outs (fixtures linked to BC-04 / BC-02 2026-11-16).
- Check WCNP WC-04 (new library item) + its L under panel WC-16 in 3D / cut list.
