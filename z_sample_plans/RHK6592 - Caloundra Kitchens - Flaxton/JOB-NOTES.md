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
- **Main Bathroom** `6980f63e-923d-4ea8-ae57-a604eb4fa00e` — layout `z_plan_automation/layouts/rhk6592-flaxton-main-bath.json` (rev 3).
- **Ensuite** `8160a0cd-80aa-42e3-9b00-723db14b0747` — layout `z_plan_automation/layouts/rhk6592-flaxton-ensuite.json` (rev 3).
- **Bookshelf (Sunroom)** — left for now (Mark). Raw satin board, painted on site by others; photos only, no dims.

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
- Waterfalls: WF on a 20 slab next to MA60 aprons now draws as a built-up 60 waterfall (2026-10-29): 60 face
  piece mitred to the leg + apron, 100 return behind it. Re-resolve the tops to get the face/return supply parts.

## Rev 3 — vanities (Mark 2026-10-29)

Source: `ARCHITECTURALS/296 Flaxton Dr, Flaxton - Vanity Units & Open Book Shelf (1).pdf`. Mark's answers: semi
inset basins (library "White Semi Recessed Basin 530x360" for now), 5 adj shelves in the tall, bulkhead flush with
the carcass, 16s against walls = fillers on the kick, seen vanity panels to the floor, bookshelf later, main bath
~3480 with the opening as their elevation.

- Rooms set up by `_tmp-6592-bath.mjs`: room door style Flat Panel 16mm + new PT range colour "Classic White Matt"
  (door_schedule_materials, material PT Colour Matt 16mm – Classic White Matt); room_materials exposed + door_face =
  that board (base/wall/tall); room kick face Whiteboard 16.5; room TOEH 140. Rest of the job stays 2pac 18.
- Bench 850 = 20 stone on an 830 carcass incl kick; vanity carcass 455 (473.5 OA with 16.5 doors). Tops 495 deep,
  arris, 20 past the seen panel (`_tmp-6592-bath-tops.mjs`, underside 830).
- Main: tall TFK 16 | T2D 648 (5 adj, hinges [100, 890, 1485, 1880] off the shelf holes) | TEPF 16.5 = 680.5 x 2125,
  318.5 OA; BH 75 (2125-2200) wall to the carcass edge, flush with the carcass. Vanity BEPF 16.5 | B2D 692 | D3 400 |
  B2D 692 | BFK 16 at the wall; 2 basins (front 100 past the top, rim 65 up). Opening 855 x 2080 at 720 on the back
  wall (scaled off their elevation). Side walls 1000 as their plan.
- Ensuite: BFK 16 | D3 360 | B2D 700 | BEPF 16.5, top 1112; one basin. Walls 1000 + 2388 as their plan.
- Both resolver clean, kicks joined, basins linked (main BC-02 / BC-04, ensuite BC-03), spec blocks added.
- Open: basin + tap models TBC (no taps drawn); main bath room depth not given (side walls drawn 1000); quote says
  the kitchen is shaker — Mark: revisit once shaker doors are built properly.

## Rev 4 (Mark 2026-10-29)

- Library basin renamed "White Semi Inset Basin 530x360" (was "Semi Recessed"; placed copies renamed too, incl RHK6586).
  Bathroom basins named "Semi inset basin", centred on the 495 top depth (y 67.5, front 427.5) — moved with
  updateFixture (a DB-only move snaps back to the cabinet link). Spec blocks say "Semi inset".
- Main tall TC-02 handles 1000 AFF to the handle centre: face_grid zones grip_edge bottom, handle_offset 796
  (door bottom at the 140 kick + 796 + 64 half of the 128 centres). Resolver clean.

## Rev 5 — shaker doors (Mark 2026-11-01)

- Quote (ISS 1, 28/10/26): kitchen "doors, drawers and panels (shaker style)", butlers "doors and panels (shaker
  style)", both 2pac satin; bathrooms Flexipanel New Classic White (flat, unchanged).
- Job default door style 2 Pac Flat 18mm -> **Shaker — 2pac** (`2610ca59`, 60 frame, 5 deep pocket, Shaker Door tool
  set) by `_tmp-6592-shaker.mjs`. Same blank + colour range, so Classic White Satin stays. Bathrooms keep their room
  style (Flat Panel 16mm PT). Kitchen + butlers re-resolved, resolver clean, every front now on the shaker style.
- The 61-high oven false panel (BC-03) is too short for the 60 frame, so no pocket is cut (stays flat). The butlers
  blind false panel (352) is shaker too; it sits mostly behind the return run.
- Shaker routes are generated on the fronts when the optimiser runs (face routes), not at resolve.
- Open: end panels / fridge panels / island back panel are still flat 2pac board (quote says panels shaker too).

## Rev 6 (Mark 2026-11-01) — `_tmp-6592-rev6.mjs`

- 2pac colour renamed "Satin, to match Polytec Classic White" (only this job uses it), so `{fronts}` reads
  "Shaker — 2pac - Satin, to match Polytec Classic White"; spec block lines updated (kitchen + butlers).
- Kitchen Wall 1: CAD "FRIDGE OPENING 920W x 1850H" in the fridge space.
- Butlers: Wall 4 "DISHWASHER / WASHER / DRYER SPACE 610W x 880H"; "VOID CORNER" on Wall 1 (0–580) and Wall 4
  (3355–3915); Wall 2 TC-02 / TC-03 "OPEN SHELVES PT CLASSIC WHITE MATT".
- New resolver error HINGE_RAIL_CLASH (hinge level with a front top rail). Upright-rail sink cupboards clashed:
  main BC-02 / BC-04 and ensuite BC-03 hinges -> [100, 556], butlers BC-02 -> [100, 636] (30 lower, under the rail).
  All four rooms resolver clean.

## Rev 7 — handles on the shaker rails (Mark 2026-11-01)

- Every kitchen + butlers cabinet with doors / drawers: `hardware_overrides` handle_offset 30 + handle_inset 30
  (`_tmp-6592-handles30.mjs`). Drawers: centred, hole line 30 down (centre of the 60 top rail). Doors: hole line 30 in
  from the opening edge (centre of the stile), nearest hole 30 from the grip edge — top on base doors, bottom on
  overheads. Checked resolved: BC-02 drawer x 223.5 / y 332 on 447 x 362; BC-06 door x 30 / centre 632 on 726.
- Job Handle Holes = Don't drill (rule_overrides.HANDLE_DRILL false, set 2026-10-29), so no holes are machined.
- BC-11 top two drawer fronts 170 -> 180 (locked rows 1 + 2) to line up with BC-08's 4 x 180; bottom drawer
  382 -> 362 (`_tmp-6592-dr.mjs go 180`). Resolver clean.

## Rev 8 — Flavio's edited plans (Liam email 2026-11-04, Mark 2026-11-05)

Source: `_JOBS/.../RHK6592 .../SITE CHECK MEASURES/` (floating shelf.pdf, Pantry wall.pdf, pantry cabinets.pdf).
Scripts `_tmp-6592-rev8db.mjs` (DB, edits in place) then `_tmp-6592-rev8.mjs` (canvas bridge).

- 2pac colour (`334dab4c`) renamed **Dulux White on White Satin**; kitchen + butlers spec blocks updated.
- Butlers Wall 1 (sink / blind) 2230 -> **2290** site measure: room 60 deeper (Wall 1 + Wall 3 2290, Wall 4 at y 2290,
  south run moved 60 south, same offsets). Mark: sink cupboard BC-02 750 -> **810** (40 filler + 860 blind kept).
  KICK 1 1710. Sink + tap re-linked (sink y 1565, tap y 1323.5). Their 16 panels ignored — ours stay 18 (board);
  entry space kept at 1395 as drawn.
- Butlers south top (BT2): **20 stone waterfall** at the entry end, outside the 18 end panel BC-08 (which stays);
  top 2540 OA incl the leg (was 20 overhang past the panel). BT1 1690.
- **WC-01 FLSHLF** floating shelf on Wall 4, 2540 (= the top incl waterfall, west wall to the waterfall face),
  double build 2 x 18 2pac satin = 36, underside 1500 (600 above the 900 bench), seen left (entry) only. No LED.
  Depth = library default 250 (not given).
- **TC-05 broom cupboard** 450 x 2200 (T2D re-gridded to one door), RH hinge, door Flat Panel 16mm PT Classic White
  Matt (zone style + material_overrides.door_face), carcass 281.5 = 300 OA incl the door; no shelves; own kick.
  **TC-06 TEPF** 16.5 PT at 3008.5, 300 OA. The doorway past TC-04 is gone (there was no doorway object, only the
  TC-04 note). Open shelving kept at 6 adj shelves (their drawing shows 8 — Mark: leave).
- All resolver clean.
