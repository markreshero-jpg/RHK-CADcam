// RHK6592 benchtops. Kitchen (rotated 90° left): 20 stone on the carcass (880) + MA60 apron, WF 60 waterfalls.
// Butlers: 20 stone, arris edges, one top per wall (south top runs through the corner).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const KIT = 'dc7a22f3-ed0b-4771-a42e-4548fc4de1e1', BUT = '1c00eb19-09c1-41b8-8c7c-a6441ee0263d'
const STONE20 = 'da288276-4dfc-4410-b6f6-d53d1b38c8fd'
const MA60 = '59a7169d-761a-414d-82b0-bd8ea7123853', WF = 'ec8720a4-d679-414f-8936-03679e555932', ARR = 'ec4c909c-11b4-4916-ab99-b1081b2ffd95'
const W = { wall: true }, J = { wall: false }, E = p => ({ wall: false, profile_id: p }), F = { wall: false, profile_id: WF, waterfall_join: 'mitre' }
const walls = async room => Object.fromEntries((await sb.from('walls').select('id,name').eq('room_id', room)).data.map(w => [w.name, w.id]))
// pts clockwise, edges[i] = edge from pts[i] to pts[i+1]
const top = (room, label, wall, pts, edges, notes) => ({
  room_id: room, label, wall_id: wall, wall_side: 'face', height_mm: 880, benchtop_schedule_id: STONE20, notes,
  polygon: pts, edge_tags: [], join_types: [], arc_segments: [], cutout_polygons: [], joins: [],
  segments: pts.map((p0, i) => ({ type: 'line', p0, p1: pts[(i + 1) % pts.length], edge: edges[i] })),
})
const P = (...xy) => xy.map(([x, y]) => ({ x, y }))
const kw = await walls(KIT), bw = await walls(BUT)
const rows = [
  top(KIT, 'Benchtop 1', kw['Wall 1'], P([1954, 3325], [3514, 3325], [3514, 3925], [1954, 3925]), [E(MA60), W, W, F],
    'Wall run: YDL Stone Nuvola Snow, 20 on the carcass + 60 mitred apron, 900 top, 600 deep. 60 waterfall at the left (old north) end; right end to the fridge panel.'),
  top(KIT, 'Benchtop 2', kw['Wall 5'], P([1959, 1340], [4470, 1340], [4470, 2240], [1959, 2240]), [E(MA60), E(MA60), E(MA60), F],
    'Island: YDL Stone Nuvola Snow, 20 + 60 mitred apron, 2511 x 900 (~300 seating overhang at the back). 60 waterfall at the left end, 20 past the end panel on the right. Undermount sink 600.'),
  top(KIT, 'Benchtop 3', kw['Wall 1'], P([0, 3605], [966, 3605], [966, 3925], [0, 3925]), [E(MA60), E(MA60), W, W],
    'Small cupboard: YDL Stone Nuvola Snow, 20 + 60 mitred apron, 966 x 320, 20 past the seen panel.'),
  top(BUT, 'Benchtop 1', bw['Wall 1'], P([0, 0], [600, 0], [600, 1630], [0, 1630]), [W, E(ARR), J, W],
    'Butlers west: YDL Stone Nuvola Snow 20mm, 600 deep. Butt joint to the south top at the corner. Undermount sink 600.'),
  top(BUT, 'Benchtop 2', bw['Wall 4'], P([0, 1630], [600, 1630], [2540, 1630], [2540, 2230], [0, 2230]), [J, E(ARR), E(ARR), W, W],
    'Butlers south (over the D/W, washer, dryer): YDL Stone Nuvola Snow 20mm, 600 deep, runs through the corner, 20 past the end panel.'),
]
for (const room of [KIT, BUT]) await sb.from('benchtop_instances').delete().eq('room_id', room)
const r = await sb.from('benchtop_instances').insert(rows).select('id,room_id,label')
if (r.error) { console.error(r.error.message); process.exit(1) }
console.log(JSON.stringify(r.data))
