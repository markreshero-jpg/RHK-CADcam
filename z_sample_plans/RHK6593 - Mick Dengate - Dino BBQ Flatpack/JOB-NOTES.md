# RHK6593 — Mick Dengate — Dino BBQ Flatpack

Source: Mark's spec text 2026-10-27 (no plan). Alfresco kitchen, flatpack.

## Finishes
- Tops: Smartstone Sintered Range 20mm, "Colour TBC" (White).
- Fronts: Stylelex 18mm, colour TBC → new library style **Stylelex 18mm** (blank "18mm Stylelex",
  colour range "Stylelex 18mm", colour "Colour TBC" → board "Stylelex 18mm - Colour TBC", placeholder
  sheet size + edgeband cloned from LX Abs Grain 18mm). Exposed panels + kick face on the same board.
- Handles: finger pulls (handle schedule Sharknose Finger Pull, cloned with the job defaults from RHK6590).

## Locked decisions (Mark 2026-10-27)
- Bench 2600 x 700 x 900. Kick 140 (880 carcass incl kick + 20 top). Fingerpull: carcass 675 (5 overhang).
- Spec widths came to 2754 > 2600 → sink 550, wine fridge 550, BBQ cupboard takes the rest (846).
- Run L→R: BEPF 18 | BSK 550 (rails on edge) | BBIN 300 | B2D 846 (cupboard under the 900 BBQ) | B1D 300 |
  BEPF 18 | wine fridge space 550 | BEPF 18.

## App
- Project `047aff64-b151-4cb0-b074-6007eaf03261` (defaults cloned from RHK6590, TOEH 140, base 880/675).
- Room **Alfresco Kitchen** `daf418a3-f01d-48dd-abe4-053e6a97b084`, layout
  `z_plan_automation/layouts/rhk6593-dengate-alfresco.json`. Placeholder 3600 x 3000 room, run on Wall 1 from 500
  so both ends are open. KICK 1 joined 518–2514. Benchtop 1 2600 x 700 at 880 (20mm Stone schedule).
  CAD: wine fridge space, BBQ note, spec block. 0 errors / 0 warnings.
- Sink: none (Mark 2026-11-25). The earlier Abi Ohelu note was wrong for this job.

## BBQ (Mark 2026-11-23)
- **Weber Baby Q Premium Q1200N, LPG, Charcoal Grey.** Spec sheet, owner's manual and quick guide saved in
  `_JOBS\RHK6500 - 6599\RHK6593 - Dengate - Dino Alfresco\APPLIANCES`.
- Portable benchtop unit, NOT a built-in: manual says "do not build this model in any built-in or slide-in
  construction". Sits on the stone top, so no BBQ cut-out. 1050 W (side tables out) x 440 D x 380 H lid
  closed; lid open 640 H x 560 D; 11 kg. Manual: 610 clear of combustibles all round, no combustible cover
  overhead, bottle max 9 kg, 1 m hose, no spare bottle under the BBQ.
- Mark 2026-11-23: gas bottle in the cupboard under the BBQ with a hole in the top; take width out of BC-05
  if needed (not needed, widths unchanged); the wall above the bench is block.
- Drawn 2026-11-23 (`z_plan_automation/_tmp-6593-babyq.mjs`): Baby Q fixture (new library item, model =
  the Weber Q shape in Charcoal Grey sized to the Baby Q) centred on BC-04, back 130 off the wall so the lid
  opens, linked to BC-04. Hose hole 60 dia in the top = a round cut-out on the placed BBQ, 330 right of the
  BBQ centre (2121 along the wall, under the right side table, inside BC-04), 250 off the wall. BC-04 shelf
  removed for the bottle. Elevation notes: old BBQ note reworded in place + "9KG GAS BOTTLE / NO SHELF -
  VENTS TBC" in BC-04. 0 errors / 0 warnings.

## BBQ set-down well (Mark 2026-11-25) — replaces "sits on the top"
- Client wants the Baby Q set DOWN so the top of the grill plate is flush with the benchtop, in an all-stone
  recess (stone sides + stone bottom). Mark: open at the front, side tables come off, set it down to roughly
  what I think and he'll check it later.
- **Set-down 215 is a PLACEHOLDER.** Weber publishes no feet-to-top-of-grill figure (old Q1200 page lists
  "cooking height 15 cm", reference not stated). Measure the real BBQ before stone is cut.
- Drawn (`z_plan_automation/_tmp-6593-setdown.mjs`):
  - Benchtop 1 notched over BC-04, open at the front: well 806 wide x 590 front to back inside the stone,
    110 of top left behind it. The three notch edges carry a new edge profile **Mitred Apron 215 (set-down
    well side)** (code MA215) = 20 stone sides + back down to the well bottom.
  - New top **BBQ well bottom** 846 x 610 (x 1368–2214, y 90–700), top face 685 off the floor, on BC-04.
  - BC-04 lowered: carcass 525 high (top at 665), doors follow. Still the gas bottle cupboard, no shelf.
    About 490 clear inside — a 9 kg bottle (~480–500 tall) is very tight, a 4 kg fits.
  - BBQ fixture: 660 body (side tables off, `..._NoTables.glb`), centred on BC-04, feet on the well bottom
    (z 685), front 20 back from the top's front edge, 130 behind it for the lid. 73 clear each side.
  - Hose hole 60 dia through the well bottom behind the BBQ on the right (2041 along the wall, 175 off it).
  - Elevation notes reworded in place. 0 errors / 0 warnings.
- Not drawn / to sort: backing behind the stone back piece (90 gap to the wall), a drain / vent path so gas
  can't pool in the well (LPG is heavier than air), Weber's manual says don't build this model in.

## Open
- Gas bottle cupboard: vents (door / kick / back?) and gasfitter OK for a bottle under the BBQ — the Weber
  manual puts the bottle on the ground behind the BBQ and says no spare bottle under it. Hose hole size
  (60 drawn; the regulator end may need more) and position to confirm.
- **No sink in this job (Mark 2026-11-25).** No sink / tap fixture and no sink cut-out. BC-02 is still the
  BSK sink cabinet def (rails on edge) from the first spec; left as is unless Mark wants it changed. Colours.
- Waiting on Mick to approve the set-down well (Mark 2026-11-25).
- Benchtop: press Resolve on both tops (Benchtop 1 + BBQ well bottom) so the parts match the well.
- Set-down 215, well size 806 x 590, 9 kg vs 4 kg bottle, hose hole position: all to confirm with Mark.
- Wine fridge: model/height not given; no ventilation detail drawn.
