# RHK6583 Andy Piggott - U2 Hastings St Beach Houses - Bathroom Cupboard

Supply only, ex factory, no site visits. Quote ISS 1 accepted 4/11/2026 ($3,245 ex).

- Job folder: `C:\Users\mark\SynologyDrive\_JOBS\RHK6500 - 6599\RHK6583 - Andy Piggott - U2 Hasting st Beach Houses - Broom Cabinet`
- Client drawing: `ARCHITECTURALS\HBH#2 Bathroom Cupboard Final Drawing.pdf` (hand sketch, received 24/11/2026)
- App: project `52ebcec4-f8c0-4047-a9ce-13c027fef9b9`, room Bathroom `33e64c8a-ebf9-498f-86d1-9879b1ccba0d`
- Layout: `z_plan_automation/layouts/rhk6583-piggott-bathroom-cupboard.json`
- Scripts: `z_plan_automation/_tmp-6583-hinge.mjs`, `_tmp-6583-cad.mjs`

## Drawn 2026-11-24 (first pass, nothing confirmed yet)

Job defaults were empty; set from RHK6603 (construction, hinges, runners, drawer boxes) with
2 Pac Flat 18mm fronts in "2 Pac Gloss - Colour TBC", exposed = Satin Board 18 White,
handle schedule CabinetWare Square 128 as a stand-in.

| Item | As drawn |
|---|---|
| Overall | 670 W x 2420 H x 490 D (depth incl doors) |
| Build | TC-01 TEPF 18 + TC-02 T2D 634 + TC-03 TEPF 18, carcass 470 deep, no kick |
| Feet | 5mm plastic feet under, not drawn (note only). Room height 2430 = 5 feet + 2420 + 5 clear |
| Inside | Fixed shelf top at 2000 (420 above it), oval hanging rail 100 under it (locked Y 1868.5), hanging to a fixed shelf with its top at 300, inner drawer Dragon Pro 400x178 under it (box Y 16.5, front 18.5-214.5 = 2 up from the base) |
| Doors | 2 full height, 5 hinges each [2314, 1808, 1302, 796, 360] (bottom hinge 60 above the 300 shelf) |
| Mirrors | Inset in each door, routed from the back. CAD outline only for now: 60 in from each edge, 100 up, top at 2000 |

The wall in the room is only there to hold the cupboard on the canvas.

## Mark's answers 2026-11-24

1. Height 2420 is the box, with the 5mm feet extra (2425 overall). As drawn.
2. Mirror size OK. A new, editable mirror door style is needed (Mark is starting that in a new conversation).
3. Mirror is routed in from the back of the door. Mark will sketch it for the door style; we'll do these often.
4. Finish: "Gloss white, colour TBC".
5. End panels both sides: OK.
6. 178 inner drawer under a fixed shelf at 300 high. First drawn with the front 30 down from the shelf, then Mark: drawer down, front only 2 up from the base. Done.
7. Handles TBC (still on the drawing as a TBC cloud).
8. Cut the 2420 parts from longer sheets.
9. Hanging depth is tight but it will have to do.
10. Hanging rail stays 100 under the shelf.

## Mirror doors applied 2026-11-25

- Both TC-02 doors (314.5 x 2420) take the profile **Mirror inset — 60 sides, 100 bottom, 420 top**
  (library copy of "Mirror inset", Mirror Door tool set: 15.9 x 6.35 rebate from the back, opening
  cut through, 4mm mirror siliconed). The doors keep their 2 Pac style and colour (Face Grid → Profile).
- Opening 194.5 x 1900 (top at 2000). Mirror to order: 223.3 x 1928.8 x 4mm, qty 2 (Reports → Glass Order).
- The two dashed CAD mirror outlines were removed. The "MIRROR INSET" labels and note stay.
- Script `z_plan_automation/_tmp-6583-mirror.mjs`.

## Still open

- Handles.
- Exact white.

## Approval 2026-11-24

- Approval PDF saved to `PDF\Drawings to be Approved\RHK6583 - Andy Piggott - U2 Hastings St Beach Houses - Bathroom Cupboard Shop Drawings for Approval - 24.11.26.pdf`.
- Reply draft to Andy in the QUOTE RHK6583 thread (cc Charlene), asking for the gloss white colour + handles. PDF attached by hand.
