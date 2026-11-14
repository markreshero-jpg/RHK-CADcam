// Generates layouts/rhk6468-mossman-wir.json (Mark 2026-11-15)
// Source: ARCHITECTURALS/28 Mossman Court - WIR - A3 MARKED UP.pdf (7.07-7.09 Rev B) + Mark's answers.
// 550 OA everywhere (532 carcass + 16 door + 2). Kick 120 on all (separate kick-only cabinets so the
// cabinet frames start at the carcass bottom). Top line 2663 + 30 BH (CH 2693).
// Equal sections: the 950 VOS bays shrink equally on each run (north 934, south 878).
import fs from 'node:fs'
const KICK = 120, TOP = 2663, H = TOP - KICK, D = 532, OA = 550
const C = []
const add = (def, wall, offset, dx, dy, dz, note, set, rules) => C.push({ def, wall, offset, dx, dy, dz, note, ...(set ? { set } : {}), ...(rules ? { rules } : {}) })
const one = (face_type, extra = {}) => ({ cols: [{ col_index: 0, width_locked: false }], rows: [{ row_index: 0, height_locked: false }], zones: [{ col_index: 0, row_index: 0, face_type, ...extra }] })
const pair = hinges => ({ cols: [{ col_index: 0, width_locked: false }, { col_index: 1, width_locked: false }], rows: [{ row_index: 0, height_locked: false }],
  zones: [{ col_index: 0, row_index: 0, face_type: 'door', hinge_side: 'left', ...(hinges ? { hinges } : {}) }, { col_index: 1, row_index: 0, face_type: 'door', hinge_side: 'right', ...(hinges ? { hinges } : {}) }] })
const drawers = n => ({ cols: [{ col_index: 0, width_locked: false }], rows: Array.from({ length: n }, (_, i) => ({ row_index: i, height_locked: false })),
  zones: Array.from({ length: n }, (_, i) => ({ col_index: 0, row_index: i, face_type: 'drawer_face' })) })
const blind = side => ({ cols: side === 'left'
    ? [{ col_index: 0, width_locked: true, width: 588 }, { col_index: 1, width_locked: false }]
    : [{ col_index: 0, width_locked: false }, { col_index: 1, width_locked: true, width: 588 }],
  rows: [{ row_index: 0, height_locked: false }],
  zones: side === 'left'
    ? [{ col_index: 0, row_index: 0, face_type: 'false_panel' }, { col_index: 1, row_index: 0, face_type: 'door', hinge_side: 'left' }]
    : [{ col_index: 0, row_index: 0, face_type: 'door', hinge_side: 'right' }, { col_index: 1, row_index: 0, face_type: 'false_panel' }] })
const RAIL = { type: 'accessory', key: 'HANGING_RAIL_OVAL', y_locked: false }
const open = (fittings = []) => ({ type: 'open', fittings })
const adj = n => Array.from({ length: n }, () => ({ type: 'adj_shelf', y_locked: false }))
// Carcass frame (Y 0 = carcass bottom at 120 AFF): fixed shelf tops at Y 1000 (1120 AFF) and Y 2000 (2120 AFF).
const tallBase = { pos_z: KICK, has_toekick: false, top_type: 'full_top' }
const openTall = { ...tallBase, has_face: false, exposed_interior: true, face_grid: one('open') }
// Inner drawers: 4 x 127 boxes (145 fronts) spread over the 967 below the 1120 shelf, 77 gaps (hinges fit)
const inner = [92, 314.5, 537, 759].map(y => ({ type: 'inner_drawer', height: 127, y_locked: true, y_position: y }))
const innerTree = { tree: { type: 'hsplit', children: [
  { size: 967, separator: 'fixed_shelf', section: open(inner) },
  { size: 983.5, separator: 'fixed_shelf', section: open([RAIL]) },
  { section: open() }] } }
const doubleTree = { tree: { type: 'hsplit', children: [
  { size: 1967, separator: 'fixed_shelf', section: open([{ type: 'accessory', key: 'HANGING_RAIL_OVAL', y_locked: true, y_position: 931.5 }, RAIL]) },
  { section: open() }] } }
const fullTree = { tree: { type: 'hsplit', children: [{ size: 1967, separator: 'fixed_shelf', section: open([RAIL]) }, { section: open() }] } }
const shoeTree = { tree: { type: 'hsplit', children: [{ size: 1967, separator: 'fixed_shelf', section: open(adj(7)) }, { section: open() }] } }
const boxTree = { tree: { type: 'hsplit', children: [{ size: 967, separator: 'fixed_shelf', section: open(adj(2)) }, { section: open() }] } }
const FINGER = { REVT: 25, GAPR: 25 }   // drawers down 25 for finger gaps (PTO doors, no handles)
const kick = (wall, offset, dx, dz = D, rules) => add('B1D', wall, offset, dx, KICK, dz, `${KICK} kick, PT Classic White Matt`, { has_carcass: false, has_face: false, has_internal: false, has_toekick: true }, rules)
const bh = (wall, offset, dx, dz = D) => add('BH', wall, offset, dx, 30, dz, `30 BH ${TOP}-${TOP + 30} (CH ${TOP + 30})`, { bulkhead: { front: 'carcase', auto_h: true, cleat: true, left: { on: false, depth: 0, joint: 'mitre' }, right: { on: false, depth: 0, joint: 'mitre' }, bottom: { on: false, depth: 0, joint: 'mitre' } } })
const wup = (wall, offset, dx, z, note) => add('WUP', wall, offset, dx, 16.5, OA, note, { pos_z: z })
const hingesB = [53, 720, 1055, 1700, 2440]

// ── Wall 2 north (Elev 1), W -> E ──
add('TEPF', 2, 0, 16.5, TOP, 583, 'Full panel at the bench seat end, flush with the 601 nib wall (Mark markup), floor to 2663', { pos_z: 0 })
add('B1D', 2, 16.5, 871.5, 263.5, D, 'BENCH SEAT: 1 drawer, seat top 400 AFF (16.5 top over)', { ...tallBase, face_grid: one('drawer_face'), internal_grid: { tree: open() } }, FINGER)
wup(2, 16.5, 871.5, 383.5, 'Bench seat top 16.5 PT, 383.5-400')
add('D4-SSSL', 2, 888, 700, 1013.5, D, 'BENCH: 4 drawers, bench top 1150 AFF', { ...tallBase, face_grid: drawers(4) }, FINGER)
wup(2, 888, 700, 1133.5, 'Bench top 16.5 PT, 1133.5-1150')
wup(2, 17.5, 1569.5, 2103.5, 'Top shelf over the bench seat + bench, top 2120 AFF (robe hooks + mirror below by others)')
add('T2D', 2, 1588, 633, H, OA, 'SHOES: open, 7 shoe shelves angled 15 deg (front low), top shelf 2120', { ...openTall, internal_grid: shoeTree })
add('D4-SSSL', 2, 2221, 934, 1000, D, 'OPEN SHELVES bay: 4 drawers below, top 1120', { ...tallBase, face_grid: drawers(4) }, FINGER)
add('W2D', 2, 2221, 934, TOP - 1120, OA, 'OPEN SHELVES 1120-2663: 2 adj shelves, fixed shelf 2120', { has_face: false, exposed_interior: true, top_type: 'full_top', face_grid: one('open'), internal_grid: boxTree })
add('T2D', 2, 3155, 934.5, H, D, 'HALF HANGING over 4 INNER DRAWERS (25+ finger gaps), PTO doors', { ...tallBase, face_grid: pair(hingesB), internal_grid: innerTree })
add('T2D', 2, 4089.5, 934.5, H, D, 'HALF HANGING x 2, PTO doors', { ...tallBase, face_grid: pair(), internal_grid: doubleTree })
add('TFKW', 2, 5024, 40, H, D, '40 filler for the blind corner door (east units)', { pos_z: KICK })
kick(2, 16.5, 1571.5); kick(2, 1588, 1567); kick(2, 3155, 1909)
bh(2, 0, 2221); bh(2, 2221, 1868.5); bh(2, 4089.5, 992.5)

// ── Wall 3 east (Elev 2), N -> S ──
add('T2D', 3, 0, 1101, H, D, 'FULL HANGING, blind corner behind the north run (false panel 590), PTO door', { ...tallBase, face_grid: blind('left'), internal_grid: fullTree })
add('T2D', 3, 1101, 1101, H, D, 'FULL HANGING, blind corner behind the south run (false panel 590), PTO door', { ...tallBase, face_grid: blind('right'), internal_grid: fullTree })
kick(3, 0, 2202)
bh(3, 0, 2202)

// ── Wall 4 south (Elev 3), E -> W ──
add('TFKW', 4, 550, 40, H, D, '40 filler for the blind corner door (east units)', { pos_z: KICK })
add('T2D', 4, 590, 878, H, D, 'HALF HANGING x 2, PTO doors', { ...tallBase, face_grid: pair(), internal_grid: doubleTree })
add('T2D', 4, 1468, 878, H, D, 'HALF HANGING over 4 INNER DRAWERS (25+ finger gaps), PTO doors', { ...tallBase, face_grid: pair(hingesB), internal_grid: innerTree })
add('D4-SSSL', 4, 2346, 878, 1000, D, 'OPEN SHELVES bay: 4 drawers below, top 1120', { ...tallBase, face_grid: drawers(4) }, FINGER)
add('W2D', 4, 2346, 878, TOP - 1120, OA, 'OPEN SHELVES 1120-2663: 2 adj shelves, fixed shelf 2120', { has_face: false, exposed_interior: true, top_type: 'full_top', face_grid: one('open'), internal_grid: boxTree })
add('T2D', 4, 3224, 633, H, OA, 'SHOES: open, 7 shoe shelves angled 15 deg (front low), top shelf 2120. Sticks 32 past the 518 return', { ...openTall, internal_grid: shoeTree })
kick(4, 550, 1796); kick(4, 2346, 1511)
bh(4, 532, 936); bh(4, 1468, 2389)

// ── Wall 6 mirror wall: 32 frame around the mirror (mirror by others) ──
for (const o of [0, 16.5, 1724, 1740.5]) add('TEPK', 6, o, 16.5, H, 14, 'Mirror frame stile (2 x 16.5 = 33 wide, 32 deep)', { pos_z: KICK })
kick(6, 0, 1757, 32, { TOESCF: 0, TOESCB: 0 })
bh(6, 0, 1757, 32)

const layout = {
  _source: 'ARCHITECTURALS/28 Mossman Court - WIR - A3 MARKED UP.pdf (Blake Sheridan 7.07-7.09 Rev B, Mark site measures) + Mark answers 2026-11-15',
  _notes: ['Origin = north wall west corner. Walls via _tmp-6468-wir-setup.mjs (roomId mode). Kick 120, top 2663 + 30 BH, CH 2693. 16 PT Classic White Matt room colour.'],
  projectId: '21601535-e1c8-4087-96b8-bb2506b96c3d', roomId: 'dfa682a3-020b-4704-8661-3dbbd6cdf224', roomName: 'Walk In Robe', roomHeight: 2693, wallCabinetTop: TOP,
  walls: [], cabinets: C,
}
fs.writeFileSync('z_plan_automation/layouts/rhk6468-mossman-wir.json', JSON.stringify(layout, null, 1))
console.log(C.length, 'items')
