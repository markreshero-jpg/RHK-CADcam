# RHK6592 Caloundra Kitchens + Carpentry — 296 Flaxton Dr, Flaxton

Drawings: `SynologyDrive/_JOBS/RHK6500 - 6599/RHK6592 - Caloundra Kitchens + Carpentry - Flaxton/ARCHITECTURALS/`
(Caloundra Kitchens job #3738, client Jayson Waters, Liam G 10/10/2026). Vanity Units & Open Book Shelf PDF
not read yet (Synology online-only file, download failed). Quote not read either.

## Job-level setup (2026-10-29)

- Project `f801076c-4e6b-4214-b0b6-91e92c2dfa8c`, cloned from RHK6590 (2pac 18, Dragon Pro Silk White). TOEH 110.
- Doors: 2 Pac Flat 18mm, new colour **Classic White Satin** (`334dab4c`, 2 Pac Satin 18mm range, Satin Board 18 – White).
- Handles: new **CabinetWare All Square Handle 128** (`3ac749ff`, length/finish TBC) + schedule **CabinetWare Square 128** (`ee5348f8`).
- Kick face: Whiteboard 16.5 (drawing: "16.5mm Carcase White Panel"), not the door colour.

## Mark's answers (2026-10-29)

1. Kitchen and butlers = separate rooms. 2/3. 2pac Classic White Satin on 18 satin board; end panels 18.
   60 tops: drop fronts 40 (slab 20 on the carcass). Butlers 20 stone.
4. 560 base carcass, 300 overhead carcass, fridge panels flush with the bench (600 OA).
5. Fridge overhead 2 doors ~350, top 2200. 6. Fridge panels floor to 2200.
7. Island back panel to kick height with a seen kick face below. 8. BBIN; 590 = 2 small 1 large.
9. Small cupboard 946 OA incl panels, top 966 (20 overhang on the seen left), wall on the right.
10. Rangehood TBC — W2D for now. 11. Butlers cupboard right of the sink = blind, false panel right
    (>= 320, shelving 300 deep comes off it), door hinged off it. 12. 40x40 void corner; BEPF panels
    either side of the D/W, between washer/dryer, and the end. 13. Open shelving on kick, PT 16 Classic
    White Matt, 6 adj; 16 panels floor to 2200; 24 = gap to the door frame. 14. Washer + dryer + D/W
    all freestanding. 15. Room sizes scaled; 2200 ceilings, ignore the slope.

## Rooms

- **Kitchen** `dc7a22f3-ed0b-4771-a42e-4548fc4de1e1` — layout `z_plan_automation/layouts/rhk6592-flaxton-kitchen.json`.
  Drawn 2026-10-29, resolver clean. Kicks joined (KICK 1 wall run, KICK 2 island, KICK 3 small cupboard).
  Sink/tap: library Abi Ohelu 380 U/M + Abi Pull-out mixer on BC-10 (model TBC).
  Open: benchtops + 60 waterfalls not drawn;
  small cupboard right side drawn as an 18 BFK at the wall (drawing shows a 16 panel);
  room size scaled (3925 x 5420).
- **Butlers Pantry** `1c00eb19-09c1-41b8-8c7c-a6441ee0263d` — layout `z_plan_automation/layouts/rhk6592-flaxton-butlers.json`.
  Drawn 2026-10-29, resolver clean. Blind cupboard 860 (drawing 828 — the 32 left over from the 2230 wall
  went into the false panel, 352). Open: benchtop.
- **Vanities / open book shelf** — not started; Mark will upload the PDF.

## Rev 1 (Mark 2026-10-29)

- Island back panel BC-01 -> IBPF to the floor (3 x 810 x 880, 2pac board). No separate back kick needed.
- Kick face -> Satin Board 18 – White (2pac, matches fronts) in job_toekick_materials; all kicks re-resolved.
- Sinks 600 wide (cutout 570), named "Undermount sink", rim at the carcass top 880 (z 675, bench_drop 225).
  Fixture x/y are ROOM coords of the fixture's back-left corner in its own rotated frame (not wall offsets) —
  first placement put both sinks near the north walls. Now linked: kitchen BC-10, butlers BC-02. No GLB model
  (the Ohelu 380 model would stretch), so they draw as the catalog plan shape.
- Spec blocks added on both rooms (plan, right of the room at x 4300). Butlers has no DRAWERS / Runners.

## Rev 2 (Mark 2026-10-29)

- Kitchen room rotated 90° left in the DB (`_tmp-6592-rotate.mjs`: (x,y) -> (y, 3925 - x), angles -90). Room is now
  5420 wide x 3925 deep; the wall run is on Wall 1 = south wall (drawn E->W), island Wall 5 drawn W->E (faces south),
  small cupboard at the west end. Elevations unchanged. The layout JSON is the PRE-rotation frame — don't redraw from
  it without rotating.
- Benchtops drawn (`_tmp-6592-tops.mjs`, schedule 20mm Stone, underside 880):
  Kitchen — BT1 wall run 1560 x 600 (MA60 front, WF 60 waterfall on the open end, butts the fridge panel);
  BT2 island 2511 x 900 (MA60 front/back/right end, WF waterfall left end); BT3 small cupboard 966 x 320 (MA60
  front + seen end). Butlers — BT1 west 600 x 1630 + BT2 south 2540 x 600 running through the corner (butt joint),
  arris edges, 20 past the end panel.
- Waterfalls are the WF profile on a 20 slab, so the leg reads 20 thick; the drawing's 60 waterfall (built-up)
  is in the notes only.
