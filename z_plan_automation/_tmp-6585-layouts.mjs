// RHK6585 Jojo: rewrite the three draw-plan layouts after the intake / site-sketch check (2026-11-24).
import fs from 'node:fs'
const dir = 'z_plan_automation/layouts/'
const fs33 = (cleat, l, r) => ({ stop: 30, build: 'double', cleat, strip_w: 90, tape_id: null, rebate_h: 10, seen_left: l, seen_right: r, rebate_depth: 30, strip_spacing: 600 })
const shelf = (wall, offset, dx, dz, z, l, r, note, cleat = true) => ({ def: 'FLSHLF', wall, offset, dx, dz, set: { pos_z: z, float_shelf: fs33(cleat, l, r) }, note })
const door1 = (hinge, extra = {}) => ({ cols: [{ col_index: 0, width_locked: false }], rows: [{ row_index: 0, height_locked: false }], zones: [{ col_index: 0, row_index: 0, face_type: 'door', hinge_side: hinge, ...extra }] })
const door2none = { cols: [{ col_index: 0, width_locked: false }, { col_index: 1, width_locked: false }], rows: [{ row_index: 0, height_locked: false }],
  zones: [{ col_index: 0, row_index: 0, face_type: 'door', hinge_side: 'left', handle_id: 'none' }, { col_index: 1, row_index: 0, face_type: 'door', hinge_side: 'right', handle_id: 'none' }] }
const edit = (file, fn) => { const p = dir + file; const j = JSON.parse(fs.readFileSync(p, 'utf8')); const out = JSON.stringify(fn(j), null, 1) + '\n'; fs.writeFileSync(p, out); console.log(file, j.cabinets.length, 'cabinets') }

// ── Media Unit ──
edit('rhk6585-jojo-media-unit.json', j => {
  j._notes = [
    'Walls already in the room (inserted 2026-11-23): Wall 1 left side wall (length not measured, 2000 placeholder), Wall 2 back wall 3963, Wall 3 right wall (2000 placeholder). CH 2561. Bulkhead 2305 FFL at the left end - not modelled, keep the top shelf under it.',
    'Unit 3300 OA hard against the right wall -> starts at 663 (client sketch: shelves anchored on the right-hand wall). 600 high overall = 100 kick + 467 carcass + 33 top (height NOT measured - TBC).',
    'CHECKED 2026-11-24 against the intake checklist / site-sketch rules: "400" at the end of the run = the overall bench depth (site-sketch rule), finger-pull job -> top 5 past the door faces: carcass 377 + 16 door + 2 = 395, top 400. Was 381.5 (top flush with the doors).',
    'BEPF at the seen left end + 4 x B2D (821/821/821/820.5). Right end tight to the wall, no filler drawn - TBC cloud (board-thickness BFK or 30?).',
    'TV zone 1364-2594: the datum is still open, but it barely matters - from the right wall the TV sits at unit 706-1936, from the left wall at 701-1931 (5 apart). Drawn from the right: left shelves 706 long, right shelves 1364 long to the right wall.',
    'Shelves 33 timber grain (double 16.5 Woodmatt, colour TBC), 300 deep. Heights NOT given - drawn at undersides 1000 / 1400 / 1800 and the full-length top shelf at 2200 (top 2233, under the 2305 bulkhead). Left shelves hang from a metal rod to the ceiling at their free left end (client); right shelves anchored to the right wall.',
    'Follow-ups in the app: joinKicks on the base run; set the 33 Woodmatt colour once chosen; option on ply with clear lacquer; spec block + markup.'
  ]
  const B = (o, dx, n) => ({ def: 'B2D', wall: 2, offset: o, dx, dy: 567, dz: 377, note: `Media unit base ${n} of 4, flat panel doors PT Classic White Matt` })
  j.cabinets = [
    { def: 'BEPF', wall: 2, offset: 663, dx: 16.5, dy: 567, dz: 377, note: 'Media unit seen left end panel, to the floor' },
    B(679.5, 821, 1), B(1500.5, 821, 2), B(2321.5, 821, 3), B(3142.5, 820.5, 4),
    shelf(2, 663, 3300, 400, 567, true, false, 'Media unit top 3300 x 400 x 33 timber grain (Woodmatt, colour TBC; option ply + clear lacquer), on the bases, top at 600', false),
    ...[1000, 1400, 1800].flatMap(z => [
      shelf(2, 663, 706, 300, z, true, true, `Media unit left floating shelf 706 x 300 x 33 timber grain, underside ${z} (height TBC). Free left end hangs from the metal rod to the ceiling`),
      shelf(2, 2599, 1364, 300, z, true, false, `Media unit right floating shelf 1364 x 300 x 33 timber grain, underside ${z} (height TBC), anchored to the right wall`),
    ]),
    shelf(2, 663, 3300, 300, 2200, true, false, 'Media unit top shelf 3300 x 300 x 33 timber grain, underside 2200 (height TBC; must stay under the 2305 bulkhead at the left)'),
  ]
  return j
})

// ── Pantry ──
edit('rhk6585-jojo-pantry.json', j => {
  j._notes = [
    'Walls already in the room (inserted 2026-11-23), clockwise: 1 Wall A 1184 (S->N, from the open end up to the void), 2 void front 479, 3 void side 480, 4 Wall B 1577 (void -> right wall), 5 right wall 768. Overall 2056 (Mark wrote 2055). CH 2583.',
    'Bench 900 (client) = 100 kick + 780 carcass + 20 top (top material TBC - no top in the quote). 600 bench on a finger-pull job -> carcass 575 (intake checklist; RHK6571 the same). Was 560.',
    'CHANGED 2026-11-24 - the corner did not work as first laid out: the A drawers ran to the void (y 480) and the B cupboards started at x 600, so the last ~100 of the drawer fronts faced the side of the B cupboard and could not open. Now a VOID CORNER with a 40 face filler (BFKW) on each run, 40 x 40 from the fronts (intake checklist default): fronts at 593, so the A run ends 633 from Wall B and the B run starts 633 from Wall A. The corner under the bench (round the plasterboard void) is empty.',
    'Wall A (elev L->R = open end -> void): BEPF seen end | B1D 250 skinny chopping-board cupboard | D3-SLL 764.5 (3 drawers, top shallow for spices, Nikpol Dragon Pro) | BFKW 40 | 113 void corner. Skinny cupboard at the open end as on the client elevation.',
    'Wall B (elev L->R = void -> right wall): 114 void corner | BFKW 40 | B2D 712 | B2D 711 (plumbing opening at the RIGHT end per the client elevation - was noted on the left cupboard). Right end tight to the wall, TBC cloud.',
    'Overheads on B: WF-L 16.5 | 2 x W2D 772 x 710 x 332 (350 OA with the 16 door) | WF-L 16.5 (overheads boxed in by walls -> board-thickness wall filler each side; was 30 gaps). PT Black Matt, no handles (overhead rule). Bottom at 1600 = 900 bench + 700 splashback -> wall_cabinet_top 2310. 710 = overall incl the under panel.',
    'Floating shelves on Wall A: 3 x FLSHLF 1184 x 480 x 33 timber grain Woodmatt (480 = depth, lines up with the void front), undersides 1400 / 1700 / 2050 from the client 500 / 300 / 350 spacing above the bench. Open end seen, void end not.',
    'Follow-ups in the app: joinKicks per run; addUnderPanel under the overheads (20 set back) + LED route; green tile splashback by others; spec block + markup.'
  ]
  const base = (def, wall, offset, dx, note, extra = {}) => ({ def, wall, offset, dx, dy: 880, dz: 575, ...extra, note })
  const oh = (offset, note) => ({ def: 'W2D', wall: 4, offset, dx: 772, dy: 710, dz: 332, set: { face_grid: door2none }, note })
  j.cabinets = [
    base('BEPF', 1, 0, 16.5, 'Pantry Wall A seen end panel at the open end, to the floor'),
    base('B1D', 1, 16.5, 250, 'Pantry skinny cupboard for chopping boards (shelf or no shelf TBC)', { set: { face_grid: door1('left') } }),
    base('D3-SLL', 1, 266.5, 764.5, 'Pantry 3 drawers, top one shallow for spices. Nikpol Dragon Pro'),
    base('BFKW', 1, 1031, 40, 'Pantry corner filler, Wall A run (void corner beyond)'),
    base('BFKW', 4, 114, 40, 'Pantry corner filler, Wall B run (void corner behind)'),
    base('B2D', 4, 154, 712, 'Pantry Wall B cupboard'),
    base('B2D', 4, 866, 711, 'Pantry Wall B cupboard - opening for existing plumbing at this end (client sketch), cut-out TBC'),
    { def: 'WF-L', wall: 4, offset: 0, dx: 16.5, dy: 710, dz: 332, note: 'Pantry overhead wall filler at the void side, PT Black Matt' },
    oh(16.5, 'Pantry overhead PT Black Matt, 710 high overall incl under panel, no handles (grip under the 20 set-back under panel). LED strip under'),
    oh(788.5, 'Pantry overhead PT Black Matt, 710 high overall incl under panel, no handles. LED strip under'),
    { def: 'WF-L', wall: 4, offset: 1560.5, dx: 16.5, dy: 710, dz: 332, note: 'Pantry overhead wall filler at the right wall, PT Black Matt' },
    ...[1400, 1700, 2050].map(z => shelf(1, 0, 1184, 480, z, true, false, `Pantry floating shelf Wall A 1184 x 480 x 33 timber grain Woodmatt (colour TBC), underside ${z}`)),
  ]
  return j
})

// ── Entry Bench Seat ──
edit('rhk6585-jojo-entry-bench-seat.json', j => {
  j._notes = [
    'Walls already in the room (inserted 2026-11-23): 1 left return 600, 2 back wall 1700, 3 right return 600. The site sketch shows a wall each end (1700 F/P), so the seat fits wall to wall. CH 2400 placeholder (check on site).',
    '500 high overall (Mark) = 100 kick + 367 carcass + 33 top. "400" = overall depth -> top 400, 5 past the door faces: carcass 377 (was 381.5, top flush).',
    'CHANGED 2026-11-24: a 1700 box cannot go into a 1700 alcove - cabinet scribe 16.5 at each wall end (SCRL on the left cupboard, SCRR on the right), as on the RHK6351 Rya bench seat.',
    '2 x B1D 850 with flap-down doors (hinge bottom), 20 finger gap, PT Oasis Smooth (room colour). Door count TBC (client drew shoe drawers in 2 rows).',
    'Ply bench top: no ply board in the library yet - drawn as a 33 FLSHLF (double exposed board) placeholder wall to wall; set the ply material + thickness once confirmed.',
    'VJ panelling on the wall above (supplied by us, painted by others) and hat hooks (client sketch) - CAD notes. Follow-ups: joinKicks; spec block + markup.'
  ]
  const flap = (offset, rules) => ({ def: 'B1D', wall: 2, offset, dx: 850, dy: 467, dz: 377, rules, set: { face_grid: door1('bottom', { finger_gap: 20 }) }, note: 'Bench seat flap-down door, 20mm finger gap, PT Oasis Smooth. Cabinet scribe 16.5 at the wall end' })
  j.cabinets = [
    flap(0, { SCRL: 16.5 }), flap(850, { SCRR: 16.5 }),
    shelf(2, 0, 1700, 400, 467, false, false, 'Bench seat top 1700 x 400, thick ply (material + thickness TBC - drawn as 33 placeholder), top at 500', false),
  ]
  return j
})
