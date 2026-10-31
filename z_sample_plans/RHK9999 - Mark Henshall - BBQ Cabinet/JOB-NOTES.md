# RHK9999 — Mark Henshall — BBQ Cabinet (23 Arkana Drive)

Source: `G:\My Drive\1. Properties\2. 23 Arkana Drive\3. Plans\Cabinet Vision Drawings\House Plan - BBQ outdoor area.pdf`
(CV Elev 3 + Plan, 31/10/26). Drawn 2026-10-31.

## Locked decisions (Mark 2026-10-31)
- Top: 20 stone + 100 mitred apron (new profile MA100), 900 high, 670 deep, runs 5 past the #15 panel.
- Carcass 630 + 18 Stylelex + 2 = 650 OA. 140 kick. Fronts 640 (top-row finger gap 100 = 80 + 20 FPGAP).
- #1 = three separate cupboards: B1D 180 (hinged left) | BBIN 454.4 (rev 2; takes the chain's 4.4) | B2D 900 with an Abi Seba 550 single bowl U/M sink + Abi pull-out mixer (rails on edge).
- #5 = BFK 50 at the wall, on the kick. KICK 1 joined under #5 to #8 (0.6 – 1585).
- #9 / #11 / #13 / #15 = 100 stone panels, independent of the top, butted under the apron: BEPF 100 x 800 whose
  Applied Panel is renamed "Stone Panel", 100 thick (`dz: cab.w`), No CNC.
- Materials as RHK6593 (Stylelex 18mm fronts, panels, kick face, Sharknose finger pull). Carcass + shelves +
  kick interior: new board **CPP White 16mm** (cloned from Whiteboard 16.5mm; check sheet size + edgeband).

## App
- Project `f187ed5f-6ec8-427e-937c-b09092aaa6d4`, room **Outdoor BBQ Area** `b2ed87d8-59e8-4ad7-932d-11a1ef320061` (rev 4 redraw),
  layout `z_plan_automation/layouts/rhk9999-henshall-bbq.json`. 0 errors / 0 warnings.
- Walls: Wall 1 = left return 1315, Wall 2 = back wall 5830. The short step wall + the 1500 wall are not drawn.
- CAD: spec block (plan), stone panel note (Wall 2 elevation).

## Open
- Box at the back behind the 900 pair on the plan (gas bottle?) not drawn.
- Screen above the wall (22 lengths 38x25 RHS) not drawn.

## Rev 2 (Mark 2026-10-31)
- BC-03 → BBIN. BC-04 → single bowl U/M sink (Abi Seba 550, rim under the 20 slab, z 675).
- #10 drawers replaced by a 600 glass-door bar fridge opening between two 18 BEPFs (880, under the slab);
  everything after moved along 444. Run now ends at 4781.6, top at 4786.6, 1048.4 bare wall past it.
- Bar fridge: only 800 clear under the 100 apron at the front (880 behind it) — check the fridge height.
  No glass-door bar fridge in the fixture catalogue; drawn as a CAD note.
- Post-steps script: `z_plan_automation/_tmp-9999-post.mjs <roomId>` then `_tmp-9999-join.mjs <roomId>`.

## Rev 3 (Mark 2026-10-31)
- Sink centred on BC-04 (link 450 / 335), 110 off the wall. Tap behind it on the same centreline.
- Wall 2 raked top: 2614 at the left rising to 3900 at 5225 (605 in from the right end), flat to the end
  (`walls.top_profile`, new feature 08a7ee9). Wall 2 height 3900. The screen on top is not drawn.

## Rev 4 (Mark 2026-10-31) — current
- Whole kitchen 1000 off Wall 1. 100 waterfall ends both ends (WF mitred, built up with the MA100 apron:
  face piece + return), legs 1000–1100 and 5246–5346. Top 4346 x 670.
- L→R: BC-01 B2D 900 sink (Seba 550 U/M, rails on edge) | BC-02 BBIN 450 | BC-03 BEPF | 600 bar fridge | BC-04 BEPF |
  BC-05 B2D 1080 | BC-06 B2D 1080. KICK 1 under BC-01/02, KICK 2 under BC-05/06.
- 100 stone panels, 50 filler and the 180 cupboard left out for now (Mark). Wall 2 rake re-set after the redraw.
- Post-steps: `_tmp-9999-post.mjs <roomId>` then `_tmp-9999-join.mjs <roomId>` (rename the 2nd KICK 1 → KICK 2).
