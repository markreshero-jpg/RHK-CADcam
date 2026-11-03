// RHK6478 DS TV Unit: writes layouts/rhk6478-dune-ds-tv-unit.json (cube grids are too verbose to hand-write).
import fs from 'node:fs'
const TEAK18 = 'd67d85b0-b12b-4b03-be3c-8bdbbf23cd11', TEAK33 = '8fae4f9c-02aa-4799-a46d-52be445d247d'
const open = () => ({ type: 'open', fittings: [] })
// hsplit children are bottom-up; a separator follows every child but the last.
const rows = (...sizes) => ({ type: 'hsplit', children: sizes.map((s, i) => ({
  ...(s.size != null ? { size: s.size } : {}), ...(i < sizes.length - 1 ? { separator: 'fixed_shelf' } : {}), section: s.section ?? open() })) })
const cubes = n => ({ type: 'vsplit', children: Array.from({ length: n }, (_, i) => ({ ...(i < n - 1 ? { divider: 'single' } : {}), section: open() })) })
const LP = 359, BAY = 500, TV = 1300
const openBox = (grid, note) => ({
  set: { has_face: false, exposed_interior: true, top_type: 'full_top', internal_grid: { tree: grid },
    part_hide_views: { case_bottom: ['plan', 'elevation', '3d'] },
    material_overrides: { exposed: TEAK18, interior: TEAK18, shelf: TEAK18, back: TEAK18 } },
  rules: { BOTTOM_BACK_JOIN: 'butts_into_back' }, note,
})
const left = rows({ size: LP }, { size: BAY }, {}, {}, {}, { size: LP })
const centre = rows({ section: cubes(6) }, { size: TV }, { section: cubes(6) })
const col6 = rows({ size: LP }, { size: BAY }, { size: BAY }, {}, { size: LP })
const col7 = rows({ size: LP }, { size: BAY }, { size: BAY }, {}, { size: LP })
const right = { type: 'vsplit', children: [{ divider: 'single', section: col6 }, { section: col7 }] }
const top = (offset, dx, dz) => ({ def: 'WUP', wall: 2, offset, dx, dz, set: { pos_z: 567, material_overrides: { exposed: TEAK33 } },
  note: '33 top - LX Board 33mm Sublime Teak, 600 AFF' })

const layout = {
  _source: 'Client sketch DS TV Unit.pdf (Mark ups with Cleint 26.10.26) + Site measure 22.10.26.pdf p5 (TV/Living 3736 F/P, returns 445 / 1134, CH 2720) + Mark Q&A 2026-11-02',
  _notes: [
    'TV wall 7.89 deg off square (architecturals p30, from the linework): 3736 F/P along the wall = 3701 square between the returns, ~513 run-out. Straight front square to the room: left bays 400 deep at the left end, right cols 700 (void behind: right cols 64-213, left bays 0-364). Placed on a square line, then moved + wall angled in _tmp-6478-tv-post.mjs.',
    '100 kick + D2-LL (567) + 33 LX Board Sublime Teak top at 600, open timbergrain cube unit 600-2690, 30 BH to the 2720 ceiling for scribing.',
    '20 fillers | 500 int col | 2035 int centre (6 x ~324 LP cubes over / under a 2035 x 1300 TV opening) | 500 + 500 int right cols. All LX Abs Grain 18 Sublime Teak, sharknose drawers.',
    'Left col (bottom up): LP, speaker 500, 3 CD cubes, LP. Col 6: LP, turntable 500, speaker 500, LP, LP. Col 7: LP, speaker 500, records 500, records, LP.',
  ],
  projectId: 'fa0884a2-abd1-4370-adfa-a30044e88ef2',
  roomId: '46c02367-c556-489e-9907-67785eb2cd87',
  roomName: 'DS TV Unit',
  roomHeight: 2720,
  wallCabinetTop: 2690,
  roomRules: { TOEH: 100 },
  walls: [
    { x: 0, y: 745, length: 745, angle: 270, _: '1 left return 445 + 300 out-of-square' },
    { x: 0, y: 0, length: 3701, angle: 0, _: '2 TV wall - square placement line; angled 7.89 deg (3736 F/P along the wall) in post' },
    { x: 3701, y: 0, length: 1134, angle: 90, _: '3 right return 1134' },
  ],
  cabinets: [
    { def: 'BFK', wall: 2, offset: 0, dx: 20, dy: 567, dz: 380, note: '20 scribe filler to Wall 1' },
    { def: 'D2-LL', wall: 2, offset: 20, dx: 536, dy: 567, dz: 380, note: '2 equal drawers under the left column' },
    { def: 'D2-LL', wall: 2, offset: 556, dx: 1035, dy: 567, dz: 380, note: '2 equal drawers, centre left' },
    { def: 'D2-LL', wall: 2, offset: 1591, dx: 1036, dy: 567, dz: 380, note: '2 equal drawers, centre right' },
    { def: 'D2-LL', wall: 2, offset: 2627, dx: 527, dy: 567, dz: 680, note: '2 equal drawers under col 6' },
    { def: 'D2-LL', wall: 2, offset: 3154, dx: 527, dy: 567, dz: 680, note: '2 equal drawers under col 7' },
    { def: 'BFK', wall: 2, offset: 3681, dx: 20, dy: 567, dz: 680, note: '20 scribe filler to Wall 3' },
    top(0, 1591, 400), top(1591, 1036, 400), top(2627, 1074, 700),
    { def: 'WEP', wall: 2, offset: 0, dx: 20, dy: 2090, dz: 380, note: '20 upper scribe filler to Wall 1 (WEP turned into a front filler)' },
    { def: 'WOPN', wall: 2, offset: 20, dx: 536, dy: 2090, dz: 400, ...openBox(left, 'Left col 500 int: LP 359 / speaker 500 / 3 CD cubes / LP 359') },
    { def: 'WOPN', wall: 2, offset: 556, dx: 2071, dy: 2090, dz: 400, ...openBox(centre, 'Centre 2035 int: 6 LP cubes ~324 / TV opening 2035 x 1300 (TV 1725 x 1000) / 6 LP cubes') },
    { def: 'WOPN', wall: 2, offset: 2627, dx: 1054, dy: 2090, dz: 700, ...openBox(right, 'Right cols 2 x 500 int, 700 deep. Col 6: LP / turntable / speaker / LP / LP. Col 7: LP / speaker / records / records / LP') },
    { def: 'WEP', wall: 2, offset: 3681, dx: 20, dy: 2090, dz: 680, note: '20 upper scribe filler to Wall 3 (WEP turned into a front filler)' },
  ],
}
fs.writeFileSync('z_plan_automation/layouts/rhk6478-dune-ds-tv-unit.json', JSON.stringify(layout, null, 2))
console.log('cabinets', layout.cabinets.length)
