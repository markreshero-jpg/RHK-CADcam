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
- Sink: Abi Ohelu Single Bowl 380 U/M (Mark 2026-10-27: single bowl; BSK default double 855 was too wide) + Abi pull-out mixer, both centred on BC-02. Actual sink model TBC.

## BBQ (Mark 2026-11-23)
- **Weber Baby Q Premium Q1200N, LPG, Charcoal Grey.** Spec sheet, owner's manual and quick guide saved in
  `_JOBS\RHK6500 - 6599\RHK6593 - Dengate - Dino Alfresco\APPLIANCES`.
- Portable benchtop unit, NOT a built-in: manual says "do not build this model in any built-in or slide-in
  construction". Sits on the stone top, so no BBQ cut-out. 1050 W (side tables out) x 440 D x 380 H lid
  closed; lid open 640 H x 560 D; 11 kg. Manual: 610 clear of combustibles all round, no combustible cover
  overhead, bottle max 9 kg, 1 m hose, no spare bottle under the BBQ.
- Not redrawn yet: waiting on Mark for bottle position (hose hole in the top?) and whether the 846 / 550 /
  550 widths stay now there is no 900 BBQ.

## Open
- BBQ: swap the "BBQ 900 OVER" note for a Baby Q fixture on the top (no model in the library yet); sink
  cut-out; colours.
- Wine fridge: model/height not given; no ventilation detail drawn.
