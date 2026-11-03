// RHK6478 DS TV Unit rev 4 (TV opening 1300, record row 459) / rev 3 (2026-11-03: drawers 160 inside = 178 Dragon box, ~235 fronts; top row ONE row of
// record cubes 350 clear per Paul's email, no adj shelf; all Teak LX Colour 16mm, never 18). Rev 2: Mark's marked-up sketch 2026-11-03: 7 equal bays of 523 between 20 fillers on Wall 4
// (square island line from the left inside corner). Below the 33 bench (top 793 AFF): bays 1-5 D3 drawer banks
// (~200 fronts, 660 carcass + 100 kick), bays 6-7 open stereo bays 700 deep. Above (418 overall = 400 internal):
// bay 1 speaker 500 / 2 adj shelves, bays 2-5 TV 2056 x 1300 on the bench, bay 6 turntable 500 / records,
// bay 7 speaker 500 / 2 adj shelves, top row of cubes full width with 1 adj shelf each. Front 418 off Wall 4
// (left return 445). Writes layouts/rhk6478-dune-ds-tv-unit.json; `run` also deletes the old cabinets and draws.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
const TEAK16 = '67ecbeff-98ac-41e1-9b1a-618a5bf6a96b', TEAK33 = '8fae4f9c-02aa-4799-a46d-52be445d247d'
const R = '46c02367-c556-489e-9907-67785eb2cd87'
const FH = +(process.env.FH ?? 235)   // equal drawer fronts: 178 box + 34 lift + 20 under the Sharknose rail
const LINE = 512.8, FRONT = LINE + 418, BAY = 523, F = 20, KICKED = 100 + 3 * FH + 60, BENCH = KICKED + 33, TOP = 2690
const T = 16.5, TVH = 1300, UP_H = TOP - (100 + 3 * FH + 60 + 33)   // TV opening 1300 high off the bench (Mark rev 4)
const RS = TVH, REC = UP_H - T - RS - T   // record shelf bottom (box y); the record row takes the rest under the 16.5 top
const REC_SHELF = 100 + 3 * FH + 60 + 33 + RS   // ... AFF
const UP = TOP - BENCH            // upper boxes 793-2690, standing on the bench (no bottom)
const LOW = 500 - T, MID = RS - 500 - T   // sizes from the hidden 16.5 bottom: speaker 500 off the bench, then up to the record shelf
const at = k => F + BAY * (k - 1)   // bay k left edge along Wall 4
const posY = overall => +(FRONT - overall).toFixed(1)

const open = (fittings = []) => ({ type: 'open', fittings })
const adj = n => open(Array.from({ length: n }, () => ({ type: 'adj_shelf', y_locked: false })))
const rows = (...kids) => ({ type: 'hsplit', children: kids.map((k, i) => ({ ...(k.size != null ? { size: k.size } : {}),
  ...(i < kids.length - 1 ? { separator: 'fixed_shelf' } : {}), section: k.section ?? open() })) })
const cols = (...secs) => ({ type: 'vsplit', children: secs.map((s, i) => ({ ...(i < secs.length - 1 ? { divider: 'single' } : {}), section: s })) })
const three = { cols: [{ col_index: 0, width_locked: false }], rows: [0, 1, 2].map(i => ({ row_index: i, height_locked: false })),
  zones: [0, 1, 2].map(i => ({ col_index: 0, row_index: i, face_type: 'drawer_face', hinge_side: 'left' })) }
const MAT = { exposed: TEAK16, interior: TEAK16, shelf: TEAK16, back: TEAK16 }
const upper = (grid, note) => ({ dy: UP, dz: 418, note, rules: { BOTTOM_BACK_JOIN: 'butts_into_back' },
  set: { pos_y: posY(418), has_face: false, exposed_interior: true, top_type: 'full_top', internal_grid: { tree: grid },
    part_hide_views: { case_bottom: ['plan', 'elevation', '3d'] }, material_overrides: MAT } })
const bh = (offset, dx) => ({ def: 'BH', wall: 4, offset, dx, dy: 30, dz: 418, note: '30 bulkhead to the 2720 ceiling - scribe',
  set: { pos_y: posY(418), bulkhead: { front: 'carcase', cleat: true, auto_h: true,
    left: { on: false, depth: 418, joint: 'mitre' }, right: { on: false, depth: 418, joint: 'mitre' }, bottom: { on: false, depth: 418, joint: 'mitre' } } } })
const top = (offset, dx, dz, note) => ({ def: 'WUP', wall: 4, offset, dx, dy: 33, dz, note,
  set: { pos_y: posY(dz), pos_z: KICKED, material_overrides: { exposed: TEAK33 } } })

const drawers = [1, 2, 3, 4, 5].map(k => ({ def: 'D3-SLL', wall: 4, offset: at(k), dx: BAY, dy: KICKED, dz: 398,
  note: `Bay ${k}: 3 equal drawers (${FH} fronts, 178 box = 160 inside)`, set: { pos_y: posY(418), face_grid: three } }))
const stereo = [6, 7].map(k => ({ def: 'B1D', wall: 4, offset: at(k), dx: BAY, dy: KICKED, dz: 700,
  note: `Bay ${k}: open stereo bay, 700 deep`,
  set: { pos_y: posY(700), has_face: false, exposed_interior: true, top_type: 'full_top', internal_grid: { tree: open() }, material_overrides: MAT } }))

const left = rows({ size: LOW }, { size: MID, section: adj(2) }, {})
const centre = rows({ size: RS - T }, { section: cols(open(), open(), open(), open()) })
const right = cols(rows({ size: LOW }, { size: MID }, {}), rows({ size: LOW }, { size: MID, section: adj(2) }, {}))

const layout = {
  _source: 'Mark marked-up sketch photo 2026-11-03 + Q&A; site measure 22.10.26 (TV wall 3736 along, left return 445, CH 2720); architecturals sheet 30 (TV wall 7.89 deg)',
  _notes: [
    'Rev 3. Wall 4 = square island line from the left inside corner (3701). Front 418 off it; stereo bays 700 deep (back 230.8, clear of the TV wall).',
    `20 filler | 7 x 523 | 20 filler. Lower: D3 x 5, ${FH} fronts, 178 Dragon box (160 inside) + 2 open stereo bays. 33 Sublime Teak bench ${KICKED}-${BENCH}.`,
    `Upper ${BENCH}-2690: bay 1 speaker 500 / 2 adj, bays 2-5 TV 2056 x ${REC_SHELF - BENCH}, bay 6 turntable 500 / records ${MID}, bay 7 speaker 500 / 2 adj; ONE row of record cubes ${REC} clear (Paul min 340-350; rev 4 TV dropped to 1300). 30 BH 2690-2720. All Teak LX Colour 16mm.`,
  ],
  projectId: 'fa0884a2-abd1-4370-adfa-a30044e88ef2',
  roomId: R, roomName: 'DS TV Unit', roomHeight: 2720, wallCabinetTop: TOP, roomRules: { TOEH: 100 },
  walls: [
    { x: 0, y: 957.8, length: 445, angle: 270, _: '1 left return 445' },
    { x: 0, y: 512.8, length: 3736.4, angle: 352.111, _: '2 TV wall, 7.89 deg off square' },
    { x: 3701, y: 0, length: 1134, angle: 90, _: '3 right return 1134' },
    { x: 0, y: 512.8, length: 3701, angle: 0, type: 'island', detached: true, _: '4 square line the unit hangs off' },
  ],
  cabinets: [
    { def: 'BFK', wall: 4, offset: 0, dx: F, dy: KICKED, dz: 398, note: '20 scribe filler to Wall 1', set: { pos_y: posY(418) } },
    ...drawers, ...stereo,
    { def: 'BFK', wall: 4, offset: at(8), dx: F, dy: KICKED, dz: 680, note: '20 scribe filler to Wall 3', set: { pos_y: posY(700) } },
    top(0, F + 2 * BAY, 418, '33 top - LX Board 33mm Sublime Teak, 793 AFF'),
    top(F + 2 * BAY, 3 * BAY, 418, '33 top - LX Board 33mm Sublime Teak, 793 AFF'),
    top(at(6), 2 * BAY + F, 700, '33 top over the stereo bays - LX Board 33mm Sublime Teak, 793 AFF'),
    { def: 'WEP', wall: 4, offset: 0, dx: F, dy: UP, dz: 398, note: '20 upper scribe filler to Wall 1 (front filler)', set: { pos_y: posY(418) } },
    { def: 'WOPN', wall: 4, offset: at(1), dx: BAY, ...upper(left, 'Bay 1: speaker 500 on the bench / 2 adj shelves / record cube') },
    { def: 'WOPN', wall: 4, offset: at(2), dx: 4 * BAY, ...upper(centre, `Bays 2-5: TV opening 2056 x ${REC_SHELF - BENCH} on the bench (TV 1725 x 1000) / 4 record cubes`) },
    { def: 'WOPN', wall: 4, offset: at(6), dx: 2 * BAY, ...upper(right, 'Bay 6: turntable 500 / records / record cube. Bay 7: speaker 500 / 2 adj / record cube') },
    { def: 'WEP', wall: 4, offset: at(8), dx: F, dy: UP, dz: 398, note: '20 upper scribe filler to Wall 3 (front filler)', set: { pos_y: posY(418) } },
    bh(0, F + BAY), bh(at(2), 4 * BAY), bh(at(6), 2 * BAY + F),
  ],
}
const out = 'z_plan_automation/layouts/rhk6478-dune-ds-tv-unit.json'
fs.writeFileSync(out, JSON.stringify(layout, null, 2))
console.log('cabinets', layout.cabinets.length)

if (process.argv[2] === 'run') {
  const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
  const del = await sb.from('cabinet_instances').delete().eq('room_id', R).select('id')
  if (del.error) throw new Error(del.error.message)
  console.log('deleted', del.data.length, 'old cabinets')
  const wall = (await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 4').single()).data.id
  try { execFileSync('node', ['z_plan_automation/draw-plan.mjs', out], { stdio: 'inherit' }) } catch { /* exit 2 = open boxes report faces:0 */ }
  // WEP -> front fillers flush with the box fronts.
  const weps = (await sb.from('cabinet_instances').select('id,label').eq('room_id', R).eq('wall_id', wall).like('notes', '%front filler%')).data
  for (const c of weps) await sb.from('cabinet_custom_parts').update({ orientation: 'front', expressions: { z: 'cab.d + 2', dx: 'cab.w', dy: 'cab.h', dz: 't.exposed' } }).eq('cabinet_instance_id', c.id).eq('name', 'Applied Panel')
  console.log('front fillers', weps.map(c => c.label).join(' '))
  // Re-resolve so the Applied Panel picks up its front-filler expressions (else it floats off the end).
  for (const c of weps) execFileSync('node', ['z_plan_automation/_tmp-6478-tv-snap.mjs', c.label], { stdio: 'inherit' })
}
