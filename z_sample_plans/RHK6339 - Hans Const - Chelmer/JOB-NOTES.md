# RHK6339 Hans Const - 116 Queenscroft St, Chelmer

Client: Stacey & Ben Hollis (builder Hans Const, Dan). Architect: Croft Architects, joinery
details WD 70-75 (Tender issue A, 06/08/25). Site check measures by Rory, red pen on
`_JOBS/RHK6300 - 6399/RHK6339 - .../SITE CHECK MEASURES/site Measured plans.pdf`.
Quote 18/09/2025: J01 J02 J04 J05 J06 J07 (J03 sun room lining is not ours).

App project `cf31069b-1a56-49ee-91df-dade35f68fde`.

## Job set-up (Mark 2026-11-11)

- Fronts + exposed: **Veneer 17mm – Blackbutt** (new board `Veneer 17mm`, 2700 x 1205 - was 2408, T102),
  tape **0.5mm Matching 22 – Blackbutt** (50m rolls). Door style `Veneer 17mm` (17 blank,
  colour range `Veneer 17mm`, colour Blackbutt, grain vertical).
- **Veneer 33mm – Blackbutt** (new board `Veneer 33mm` `0157a2d8`, colour `fca041dc`, 2700 x 1205,
  T106 12 compression - T102 only cuts 25 deep), tape **0.5mm Matching 40 – Blackbutt** `579bc59a`
  (Mark 2026-11-12, for J04).
- Carcass: PT Colour Matt 16mm Black Matt (assembly schedule "16.5mm PT Black Matt").
- Handles: Sharknose Finger Pull schedule.
- Kick 100 (job TOEH). Base default 879 incl kick, 676 deep (fingerpull, 700 top).
- Tops: **35mm Solid Timber – Blackbutt** (benchtop schedule + build method "Solid Timber
  (hand made)": measure + report only, made by hand in the shop).

## J05 Study Bench (level 1) - drawn 2026-11-11, room `ab417075-b6e2-4189-93c5-c281e1f05f9b`

Layout `z_plan_automation/layouts/rhk6339-hans-j05-study-bench.json`, post
`_tmp-6339-j05-post.mjs` (top + kick join).

- Wall 1 = back wall 2830 (site). Wall 2 = W16 window end, bench butts into the frame.
- Top 700 x 2170 incl 35 waterfall leg at the left (x 660-2830). 716 site depth to the portal
  column with 1x gyprock still to go on.
- BC-01 D4 650, 4 equal drawers (127 boxes). BC-02 692.5 one door hinged left. BC-03 792.5 one
  door hinged right + 100 false panel behind the portal column. KICK 1 joined 2135.
- Rev 1 (Mark 2026-11-11): BC-02 split into two cupboards; BC-01 was 100 high with its kick
  still on: its face_grid had no `zones`, so every re-resolve crashed (`grid.zones is not
  iterable`) and the first placement's parts stayed. Zones added, re-resolved
  (`_tmp-6339-j05-rev1.mjs`, `_tmp-6339-j05-dbg.mjs`). Spec block + SITE NOTES + BC-03 column
  note (`_tmp-6339-j05-cad.mjs`).
- Portal column (Mark 2026-11-11): 100 x 100 nominal nib wall "Portal column" off Wall 2, face
  703 off Wall 1, 2700 high: solid in plan / 3D / Wall 2 elevation. On the Wall 1 elevation it
  is a dashed see-through outline + "PORTAL COLUMN (IN FRONT)" (`_tmp-6339-j05-column.mjs`).
  Column size is nominal - confirm on site.
- Height: 928 raw floor to underside of window, 14 timber floor to come -> **914 FFL top**,
  carcass 879 incl 100 kick (drawing said 930).

### Open / TBC
- [ ] 914 top height (= window underside off finished floor) - confirm.
- [ ] 100 behind the portal column (BC-03 false panel) - OK for now, **check with builder**
  (on the elevation + SITE NOTES).
- Kick vertical grain, 2 pieces - Mark OK, on the spec block.

## J02 Stair Cupboard (ground floor sun room) - drawn 2026-11-11, room `67a27d07-1012-4537-a58d-5d3b50764221`

Layout `z_plan_automation/layouts/rhk6339-hans-j02-stair-cupboard.json`, post `_tmp-6339-j02-post.mjs`.
**No site measures - drawn as per plan, ALL MEASUREMENTS TO BE SITE CHECKED** (Mark).

- Recess 820 x 440 overall x 2700 ceiling (approx). Walls: 1 left side, 2 back, 3 right side.
- TC-01 T2D 750 x 2665 incl 100 kick x 421, at 35: **35 shadow lines** each side + top (Mark),
  CAD arrows "35 SHADOW LINE" on the elevation. Gables Veneer Blackbutt (material_overrides
  left_side / right_side) so the shadow lines show veneer.
- Shadow lines built (Mark 2026-11-11, `_tmp-6339-j02-sl*.mjs`): TC-02 / TC-03 = TFKW 35 veneer fillers each
  side, dz 402 so the face (404-421) is flush with the carcass front, 19 behind the doors; on KICK 1 (joined
  820 wall to wall). WC-01 = BH 820 x 35 at the ceiling (2665-2700), `front: 'carcase'` (fascia flush with
  the fillers), fixed height (auto_h off), no cleat / returns, veneer fascia.
- Pair of doors, 5 adj shelves black. Hinge 3 moved to 1470 (was over the shelf holes 1370/1402):
  hinges [100, 691.25, 1370, 1873.75, 2465] from the door bottom.
- New handle **Custom Timber Pull 450** (solid timber, made in the shop, secret fixed, no CNC
  holes) + schedule "Custom Timber Pull 450 (tall doors)" on this room: vertical at the meeting
  edges, centre 1275 AFF (bottom 1050).
- Pulls rebuilt 2026-11-12 (Mark: one per door, flush to the meeting edge, `_tmp-6339-j02-pull.mjs`):
  timber pull (z_handles D19) = linear strip 35 x 35, 18 x 18 rebate on the hinge-side back edge,
  new material **Solid Timber 35mm – Blackbutt**. TC-01 zones handle_length 450 / handle_inset 1165
  (1050-1500 AFF), HANDLE_DRILL false (secret fixed), lh:0 / lh:1 No CNC. Pulls 1 apart (door gap 1).

### Open / TBC
- [ ] Site measures: width, depth, ceiling.
- Doors 372.5 x 2565 were longer than the 2408 veneer sheet. Mark 2026-11-11: longer sheets -
  board **Veneer 17mm now 2700 x 1205** (whole board, all rooms). Headless nest: J02 veneer on
  2 sheets, nothing unplaced.

## J04 Sink Unit - drawn 2026-11-12, room `b2252689-fdc9-4fd7-be9a-f29853f0391e`

Layout `z_plan_automation/layouts/rhk6339-hans-j04-sink-unit.json`, post `_tmp-6339-j04-post.mjs`
(lining depth, kick join, top, CAD), shots `_tmp-6339-j04-shot.mjs`. Croft WD 72 + Rory.

- Recess 2271 frame to frame (drawing 2780), 700 back of jamb to raw wall (no gyprock). Walls 1 left
  end, 2 back, 3 right end. Joinery flush with the jamb face: top 700, carcass 676 (as J05).
- Floor 14 timber (Mark: as J05): 2228 raw to underside of shadow -> shelf top 2214 FFL. Bench 900 FFL,
  100 kick, carcass 865 incl kick, 35 solid timber top 2271 x 700 wall to wall (Benchtop 1, 865).
- Base L->R (Mark OK): BC-01 D3 580 equal drawers | BC-02 B1D 550 hinged left | BC-03 B2D 1141 sink,
  no shelf, rails on edge, undermount SS sink + HWU by others. KICK 1 joined 2271.
- WC-03 open shelf WOPN 2243 (between the linings) x 420 x 510 (setback ~190 scaled off the section),
  WALLZ 1794, 4 equal bays (3 dividers): **33 veneer** top / bottom / sides / divisions, 17 veneer back
  (Mark). 32 timber nosings left off for now - may add later.
- WC-04 A/C box W1D 1150 x 530 x 681 at the right end (offset 1107, flush with the shelf end), WALLZ 2249
  (35 shadow gap TBC), 33 veneer box incl back, front = false_panel = **17 veneer removable panel**,
  exhaust slots TBC. Size from the drawing (Mark: this size for now).
- 14 timber lining both ends BY OTHERS: WC-01 / WC-02 WEP 14 x 1314 x 700 (dz 681 + 19), bench top 900
  to shelf top 2214, new display material **Timber Lining 14mm (by others)** `3f6b71d6`, cabinet No CNC.

### Open / TBC
- [ ] A/C box size, shadow gap (35), exhaust slots.
- [ ] Nosings on the shelf (Mark: maybe later).
- [ ] Back splashback finish (mirror struck out - lining only noted on the ends).

## Other rooms - not drawn
- J01 garage: 4411 frame to frame - 12 sheet both sides = 4387. Ceiling TBC by Rory.
  Hoop pine 19 ply in the quote.
- J06 desk: 4508 - 1x gyp, 735 off finished floor. Top only (trough + outriggers by others), join needed.
- J07 shelf wall: 3547 beam to frame (Rory final measure), 305 frame to back of jamb, 150 filler
  at the window, 735 off FFL, 1492 to underside of beam. Call Rory re wall.
