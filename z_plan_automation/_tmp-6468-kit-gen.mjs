// Generates layouts/rhk6468-mossman-kitchen.json (RHK6468 Kitchen incl. butler's pantry)
import fs from 'node:fs'
const V17 = '8afde358-4ab0-4a2e-bb3c-4bbc89de9c9e', V33 = 'a8ec07f1-50df-4440-9157-686efefa56c2'
const p33 = { material_overrides: { exposed: V33 } }
const one = (face_type, extra = {}) => ({ cols: [{ col_index: 0, width_locked: false }], rows: [{ row_index: 0, height_locked: false }], zones: [{ col_index: 0, row_index: 0, face_type, ...extra }] })
const d3 = () => ({ face_grid: { cols: [{ col_index: 0, width_locked: false }],
  rows: [{ row_index: 0, height_locked: false }, { row_index: 1, height: 190, height_locked: true }, { row_index: 2, height: 190, height_locked: true }],
  zones: [0, 1, 2].map(r => ({ col_index: 0, row_index: r, face_type: 'drawer_face', hinge_side: 'left' })) } })
const open = (fittings = []) => ({ tree: { type: 'open', fittings } })
const adj = n => Array.from({ length: n }, () => ({ type: 'adj_shelf', y_locked: false }))
const C = []
const add = (def, wall, offset, dx, dy, dz, note, set, rules, extra) => C.push({ def, wall, offset, dx, dy, dz, note, ...(set ? { set } : {}), ...(rules ? { rules } : {}), ...(extra || {}) })
const panel = (def, wall, offset, dy, dz, note) => add(def, wall, offset, 33, dy, dz, note ?? '33 TV gable (Veneer 33 American Oak), to the floor', p33)
const drawers = (wall, offset, dx, dz, note) => add('D3-SLL', wall, offset, dx, 900, dz, note ?? 'Drawers - 190 / 190 / rest', d3())
const dwFront = (wall, offset, dz, note) => add('B1D', wall, offset, 600, 780, dz, note, { pos_z: 120, has_carcass: false, has_internal: false, has_toekick: false, face_grid: one('door', { hinge_side: 'bottom', hinges: [] }) })
const sink = (wall, offset, dx, dz, note) => add('B2D', wall, offset, dx, 900, dz, note, { face_grid: { cols: [{ col_index: 0, width_locked: false }, { col_index: 1, width_locked: false }], rows: [{ row_index: 0, height_locked: false }], zones: [{ col_index: 0, row_index: 0, face_type: 'door', hinge_side: 'left' }, { col_index: 1, row_index: 0, face_type: 'door', hinge_side: 'right' }] }, internal_grid: open() }, { RAIL_ORIENT: 'vertical' })
const bin = (wall, offset, dx, dz, note) => add('BBIN', wall, offset, dx, 900, dz, note, { face_grid: one('drawer_face', { hinge_side: 'left', drawer_type_config: { type: 'bin' } }) })
const lift = (wall, offset, dx, note) => add('W1D', wall, offset, dx, 750, 300, note ?? 'AVENTOS HK lift-up (2PK on the plan - finish TBC), 2 adj', { face_grid: one('door', { hinge_side: 'top', hinges: [] }), internal_grid: open(adj(2)) })
const bh = (wall, offset, dx, dz, note, left = false) => add('BH', wall, offset, dx, 30, dz, note, { bulkhead: { front: 'carcase', auto_h: true, cleat: true, left: { on: left, depth: dz, joint: 'mitre' }, right: { on: false, depth: 0, joint: 'mitre' }, bottom: { on: false, depth: 0, joint: 'mitre' } } })
const tower = (wall, offset, rowsH, zones, shelfSizes, note, hinge) => add('T2D', wall, offset, 600, 2370, 620, note, {
  face_grid: { cols: [{ col_index: 0, width_locked: false }],
    rows: [...rowsH.map((h, i) => ({ row_index: i, height: h, height_locked: true })), { row_index: rowsH.length, height_locked: false }],
    zones: [...zones.map((t, i) => ({ col_index: 0, row_index: i, face_type: t, hinge_side: 'left' })), { col_index: 0, row_index: rowsH.length, face_type: 'door', hinge_side: hinge }] },
  internal_grid: { tree: { type: 'hsplit', children: [...shelfSizes.map(s => ({ size: s, separator: 'fixed_shelf', section: { type: 'open', fittings: [] } })), { section: { type: 'open', fittings: adj(1) } }] } } })

// ── Wall 7: kitchen run (E1), S -> N, 3872 VOS, 660 carcass (700 top), seen 33 gables both ends ──
panel('BEPF', 7, 0, 900, 660, '33 TV end gable, seen - south end at the cavity slider opening')
bin(7, 33, 437, 660, 'Door mounted bin 400 double 2x31L per quote (BBIN drawn) - in front of the cavity slider')
panel('BEPF', 7, 470, 900, 660)
sink(7, 503, 800, 660, 'SINK - Franke MRG620-3535SGFPC double undermount 760 wide, Gessi pull-out mixer. Rails on edge. In front of the cavity slider (fixing on site)')
panel('BEPF', 7, 1303, 900, 660)
dwFront(7, 1336, 660, 'Miele G 7939 SCi XXL integrated D/W front (TBC - plan says int. dish drawer)')
panel('BEPF', 7, 1936, 900, 660)
drawers(7, 1969, 600, 660)
panel('BEPF', 7, 2569, 900, 660)
drawers(7, 2602, 602, 660, 'Drawers - 1336 split into 2 equal (Mark)')
panel('BEPF', 7, 3204, 900, 660)
drawers(7, 3237, 602, 660, 'Drawers - 1336 split into 2 equal (Mark)')
panel('BEPF', 7, 3839, 900, 660, '33 TV end gable, seen - north end, continue to the edge of the door jamb')

// ── Wall 8: island front (E3), N -> S, 4000 x 1080, 280 veneer end boxes on Wall 9 ──
panel('BEPF', 8, 280, 900, 660)
panel('BEPF', 8, 913, 900, 660, '33 TV gable - wine fridge Liebherr UWKES1752 in the 600 between')
drawers(8, 946, 440, 660)
panel('BEPF', 8, 1386, 900, 660)
drawers(8, 1419, 1180, 660)
panel('BEPF', 8, 2599, 900, 660)
drawers(8, 2632, 1055, 660)
panel('BEPF', 8, 3687, 900, 660)

// ── Wall 9: island back (E5), S -> N, on the back panel face (33 behind the stone) ──
const endBox = { has_toekick: false, top_type: 'full_top', exposed_interior: true,
  material_overrides: { exposed: V17, interior: V17, left_side: V17, right_side: V17 },
  face_grid: one('false_panel'), internal_grid: open() }
add('B1D', 9, 0, 280, 620, 1047, 'Island end - mitred veneer box 280 x 1080 x 620, stone (ST) 300 on top. Build per detail', endBox, null, { flip: true })
add('B1D', 9, 3720, 280, 620, 1047, 'Island end - mitred veneer box 280 x 1080 x 620, stone (ST) 300 on top. Build per detail', endBox, null, { flip: true })
add('IBPF', 9, 280, 3440, 620, 17, 'Island back panel, Veneer 17 American Oak, set back 33 behind the stone face. Closed void behind the drawers', { material_overrides: { exposed: V17 } }, null, { flip: true })
for (const o of [0, 3720]) add('IBPF', 9, o, 280, 620, 33, 'End box back face, flush with the stone (part of the mitred box)', p33)
for (const o of [942, 1636, 2331, 3025]) add('BEPF', 9, o, 33, 620, 14, '33 x 33 TV moulding, flush with the stone apron above', p33)

// ── Wall 2: south wall (E7), E -> W, 6089 wall to wall less 2 x 12 gyprock = 6065 ──
panel('BEPF', 2, 0, 900, 620, '33 TV gable at the east wall')
drawers(2, 33, 1173, 620, 'Drawers under window W7 - widened to take up the site measure (Mark)')
panel('TEPF', 2, 1206, 2370, 620, '33 TV gable, floor to 2370')
add('B1D', 2, 1239, 915, 800, 620, 'Liebherr ECBN8872 freezer drawer panels (2), recess 915 x 2032-2072 x 635 min. Panel sizes to the Liebherr guide (lower = 526 - plinth)',
  { pos_z: 120, has_carcass: false, has_internal: false, has_toekick: false,
    face_grid: { cols: [{ col_index: 0, width_locked: false }], rows: [{ row_index: 0, height: 406, height_locked: true }, { row_index: 1, height_locked: false }],
      zones: [{ col_index: 0, row_index: 0, face_type: 'false_panel' }, { col_index: 0, row_index: 1, face_type: 'false_panel' }] } })
add('T2D', 2, 1239, 915, 1129, 620, 'Liebherr ECBN8872 integrated French door panels, recess top 2052 (2032-2072)',
  { pos_z: 920, has_carcass: false, has_internal: false, has_toekick: false,
    face_grid: { cols: [{ col_index: 0, width_locked: false }, { col_index: 1, width_locked: false }], rows: [{ row_index: 0, height_locked: false }],
      zones: [{ col_index: 0, row_index: 0, face_type: 'door', hinge_side: 'left', hinges: [] }, { col_index: 1, row_index: 0, face_type: 'door', hinge_side: 'right', hinges: [] }] },
    internal_grid: open() })
add('W2D', 2, 1239, 915, 318, 620, 'Cupboard over the fridge 2052-2370', { internal_grid: open() })
panel('TEPF', 2, 2154, 2370, 620)
tower(2, 2187, [406, 600, 452], ['drawer_face', 'open', 'open'], [373, 583.5, 435.5], 'WALL OVEN tower: drawer 120-526 (top = freezer drawer line), Miele H7464BP oven 526-1126, CVA7440 coffee 1126-1578, cupboard over. TBC: top of ovens 1578 vs overhead underside 1620', 'right')
panel('TEPF', 2, 2787, 2370, 620)
tower(2, 2820, [406, 148, 452, 452], ['drawer_face', 'drawer_face', 'open', 'open'], [521, 419, 419], 'COMBI tower: drawers 120-526 + 526-674, DGC7440 combi steam 674-1126, H7440BM micro 1126-1578, cupboard over', 'left')
panel('TEPF', 2, 3420, 2370, 620, '33 TV gable at the W8 window jamb')
bin(2, 3453, 450, 620, 'Bin drawer 450')
panel('BEPF', 2, 3903, 900, 620)
sink(2, 3936, 884, 620, "SINK - butler's 370 single undermount, Franke black steel pull-out mixer, Zip tap TBC. Rails on edge")
panel('BEPF', 2, 4820, 900, 620)
dwFront(2, 4853, 620, 'Miele G 7939 SCi XXL integrated D/W front (TBC)')
panel('BEPF', 2, 5453, 900, 620, '33 TV gable - void corner beyond')
lift(2, 3453, 1156); lift(2, 4609, 1156)
bh(2, 1239, 2214, 620, '30 BH over the tall bank (ceiling 2400), seen return over the drawers', true)
bh(2, 3453, 2312, 300, '30 BH over the overheads')

// ── Wall 3: west wall (E8), S -> N, 2700 ──
panel('BEPF', 3, 639, 900, 560, '33 TV gable - void corner behind (south run)')
drawers(3, 672, 731, 560)
panel('BEPF', 3, 1403, 900, 560)
drawers(3, 1436, 732, 560)
panel('BEPF', 3, 2168, 900, 560, '33 TV gable - void corner behind (north run)')
const opn = { internal_grid: { tree: { type: 'hsplit', children: [{ separator: 'fixed_shelf', section: { type: 'open', fittings: [] } }, { separator: 'fixed_shelf', section: { type: 'open', fittings: [] } }, { section: { type: 'open', fittings: [] } }] } } }
add('WOPN', 3, 0, 300, 750, 300, 'Corner open shelves (open both sides on the plan), 2 fixed', opn)
lift(3, 300, 1050); lift(3, 1350, 1050)
add('WOPN', 3, 2400, 300, 750, 300, 'Corner open shelves (open both sides on the plan), 2 fixed', opn)
bh(3, 0, 2700, 300, '30 BH over the overheads')

// ── Wall 4: north wall (E9), W -> E, 3220 to the cavity slider less 12 gyprock = 3208, 120 gap left ──
panel('BEPF', 4, 579, 900, 480, '33 TV gable - void corner behind (west run)')
drawers(4, 612, 792, 480); panel('BEPF', 4, 1404, 900, 480)
drawers(4, 1437, 792, 480); panel('BEPF', 4, 2229, 900, 480)
drawers(4, 2262, 793, 480)
panel('TEPF', 4, 3055, 2370, 480, '33 TV tall end panel, floor to 2370. 120 gap beyond: CAVITY SLIDER TBC')
lift(4, 300, 1377); lift(4, 1677, 1378)
bh(4, 300, 2755, 300, '30 BH over the overheads')

const layout = {
  _source: "ARCHITECTURALS/REVISED KITCHEN PRELIMINARY (2).pdf (Blake Sheridan 7.02-7.06 Rev A 09/09/26) + red site measures + Quote Issue 2 + APPLIANCES (Liebherr ECBN8872 / UWKES1752 / SUIG1514, Miele) + Mark's answers 2026-11-14",
  _notes: [
    "Origin = butler's NW corner (finished faces). Kick 120 (job TOEH; ECBN8872 plinth 50-170). Base 900 incl kick + 20 stone = 920. Ceiling 2400 -> talls / overheads to 2370 + 30 BH.",
    'All units framed by 33 Veneer (American Oak) gables to the floor, fronts Veneer 17 American Oak, Whiteboard 16.5 carcass, no handles for now.',
    'Kitchen run 660 carcass (700 top). Island 4000 x 1080: 660 drawers + closed void + 17 back panel set back 33 + 33x33 mouldings; 280 mitred veneer end boxes. South / tall bank 620 (640 OA). West run 560. North run 480 (500).',
  ],
  projectId: '21601535-e1c8-4087-96b8-bb2506b96c3d',
  roomId: '58bac32f-cdca-4a86-a1a4-c29af7ef9430',
  roomName: 'Kitchen', roomHeight: 2400, wallCabinetTop: 2370,
  walls: [
    { x: 6065, y: 2060, length: 640, angle: 90, _: '1 east return at the W7 drawers' },
    { x: 6065, y: 2700, length: 6065, angle: 180, _: '2 south wall E->W (E7): 6089 less 2 x 12 gyprock' },
    { x: 0, y: 2700, length: 2700, angle: 270, _: "3 butler's west wall (E8) 2700" },
    { x: 0, y: 0, length: 3208, angle: 0, _: "4 butler's north wall (E9): 3220 to the cavity slider less 12" },
    { x: 3208, y: 0, length: 979, angle: 90, thickness: 120, _: '5 cavity slider wall (TBC)' },
    { x: 3208, y: -2893, length: 2893, angle: 90, thickness: 120, detached: true, _: '6 kitchen wall north of the slider (2860 site)' },
    { x: 3328, y: 979, length: 3872, angle: 270, type: 'island', detached: true, _: '7 kitchen run backs (E1), drawn S->N so fronts face east' },
    { x: 5807, y: -2893, length: 4000, angle: 90, type: 'island', detached: true, _: '8 island drawer backs (E3), drawn N->S so fronts face west' },
    { x: 6155, y: 1107, length: 4000, angle: 270, type: 'island', detached: true, _: '9 island back panel face (E5), drawn S->N so the face side is east' },
  ],
  cabinets: C,
}
fs.writeFileSync('z_plan_automation/layouts/rhk6468-mossman-kitchen.json', JSON.stringify(layout, null, 1))
console.log(C.length, 'items')
