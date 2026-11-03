// RHK6592 bathroom tops: YDL Stone Classic White 20 on the 830 carcass (850 top), 495 deep, arris edges.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const MAIN = '6980f63e-923d-4ea8-ae57-a604eb4fa00e', ENS = '8160a0cd-80aa-42e3-9b00-723db14b0747'
const STONE20 = 'da288276-4dfc-4410-b6f6-d53d1b38c8fd', ARR = 'ec4c909c-11b4-4916-ab99-b1081b2ffd95'
const W = { wall: true }, E = { wall: false, profile_id: ARR }
const wallId = async room => (await sb.from('walls').select('id').eq('room_id', room).eq('angle', 0).single()).data.id
const top = (room, wall, pts, edges, notes) => ({
  room_id: room, label: 'Benchtop 1', wall_id: wall, wall_side: 'face', height_mm: 830, benchtop_schedule_id: STONE20, notes,
  polygon: pts, edge_tags: [], join_types: [], arc_segments: [], cutout_polygons: [], joins: [],
  segments: pts.map((p0, i) => ({ type: 'line', p0, p1: pts[(i + 1) % pts.length], edge: edges[i] })),
})
const P = (...xy) => xy.map(([x, y]) => ({ x, y }))
const rows = [
  top(MAIN, await wallId(MAIN), P([1643.5, 0], [3480, 0], [3480, 495], [1643.5, 495]), [W, W, E, E],
    'Main vanity: YDL Stone Classic White 20mm (by others), 1836 x 495, 20 past the seen panel. 2 semi recessed basins.'),
  top(ENS, await wallId(ENS), P([0, 0], [1112, 0], [1112, 495], [0, 495]), [W, E, E, W],
    'Ensuite vanity: YDL Stone Classic White 20mm (by others), 1112 x 495, 20 past the seen panel. Semi recessed basin.'),
]
for (const room of [MAIN, ENS]) await sb.from('benchtop_instances').delete().eq('room_id', room)
const r = await sb.from('benchtop_instances').insert(rows).select('id,room_id,label')
if (r.error) { console.error(r.error.message); process.exit(1) }
console.log(JSON.stringify(r.data))
