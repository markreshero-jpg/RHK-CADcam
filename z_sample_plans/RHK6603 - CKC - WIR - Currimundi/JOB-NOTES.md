# RHK6603 CKC (Caloundra Kitchens) — WIR, 1/38 Westaway Pde, Currimundi

Drawings: `SynologyDrive/_JOBS/RHK6600 - 6699/RHK6603 - CKC - WIR - CURRIMUNDI/ARCHITECTURALS/Shop Drawings - 1 of 38 Westaway, Currimundi.pdf`
(Liam G 10/11/2026, client Brigid & Kevin, 10 pages) + Mark's marked-up photos 2026-11-23 ("6 x sliders on double track").

## Job set-up (2026-11-23, `z_plan_automation/_tmp-6603-setup.mjs`)
- Project `71c0f3d4-94cf-4faf-9004-c1ae74d20037`, cloned from RHK6351. TOEH 100, kick face Whiteboard 16.5, handles CabinetWare Square 128.
- New colour **PT Colour Matt 16mm – Designer White Matt** (`57675a0e`, range row `36cdcbf5`, style Flat Panel 16mm) on all classes + exposed.
- New board **PT Colour Matt 33mm – Bottochino Classic Matt** (`644615f7`, sheet 3600 x 1211).

## Mark's answers (2026-11-23)
1. Sliders = 16 Designer White board. 2. Robe 520 overall incl fronts. 3. Sliders floor to underside of overheads.
4. Backs 16.5 Whiteboard. 5. Robe drawer fronts Whiteboard. 6. Designer White for now, 33 Bottochino top.
7. Top from a 3600 x 33 sheet; floating shelf 33. 8. Ignore the page 6 boxes (350 x 120). 9. 320 = false panel. 10. Bay 6 left open.

## Rooms
- **WIR** `3cd247df-de60-4167-a83a-680c91385d6f` — `layouts/rhk6603-ckc-wir.json`, then `_tmp-6603-fix1.mjs`. Resolver clean (3 wide-cabinet warnings).
  Ceiling 2570: top line 2540 + 30 BH.
  - Wall 1 (window wall, S->N): BFKW 368 false panel | D2-LL 674 x 3 | D2-LL 500, 867 high, 560 carcass, KICK 1 joined.
    Drawn 320 panel became 368: the robe is 520 OA now (was 568), run still ends at the robe front line.
    WC-01 benchtop WUP 3410 x 601 x 33 Bottochino at 867; WC-02 floating shelf WUP 1810 x 200 x 33, top 1580 (depth + height assumed).
  - Wall 2 (robe wall, W->E): WC-03 corner cupboard on the bench 601 x 1640 x 502 (WALLZ 900, 2 doors hinged left, fixed shelf at the split)
    | TC-01..03 robe units 1637 / 1638 / 1637 x 1933 x 460 on separate 100 kick carriers BC-06..08, all Whiteboard, backs split at the division
    | TC-04 17 filler. Over: WC-04..08 W2D 982 / 983 x 507 x 502 (2033-2540) + WC-09 WF, WC-10 BH 30.
    Bays: 1 + 2 = 3 inner drawers (178) + fixed shelf + 3 adj; 3 = drawers + fixed shelf + rail; 4 = rail; 5 = fixed shelf, 3 adj under + 3 over; 6 open.
- **Sliders** `ef57e666-fd85-4f5c-b7c5-b6befd8af7f5` — `layouts/rhk6603-ckc-sliders.json`: 6 TEPF carriers, one face-on 842 x 2000 Designer White panel each.

## Sheet count (headless nest 2026-11-23, scratch only, no run saved)
- Whiteboard 16.5: **24** sheets (19 at 86-94 %, last 5 about 70 %). PT Designer White 16: **8** (6 are one slider each). PT Bottochino 33: **1 x 3600**.
- Not nested (too long, all thin strips): KICK 1 2890, BH fascia 5528, benchtop 3410 (the headless run did not pick up the 3600 sheet).

## Open
- Slider track system + door sizes (842 x 2000 assumed; 60 allowed in front of the 460 carcass). Mark wants SlideLine 55 / a sliding door library — talk first.
- Floating shelf depth / height / fixing. Corner cupboard door hinged at the wall with no filler. Robe carcass 460 to confirm.
- Kick seams (KICK 1), BH +10 scribe and join, TC-04 as a side-on strip.
- Not done yet: spec block, markup, HANGING RAIL notes, label declutter.
