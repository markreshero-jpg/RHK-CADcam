// RHK9999 BBQ: MA100 profile, stone blocks, BC-03 454.4 hinged right, benchtop.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (l, r) => { if (r.error) { console.log(l, 'ERROR', r.error.message); process.exit(1) } return r.data }
const R = '8940d72a-1a10-4c86-a8f0-927863d3d563', STONE20 = 'da288276-4dfc-4410-b6f6-d53d1b38c8fd'
let ma = (await sb.from('benchtop_edge_profiles').select('id').eq('code', 'MA100').maybeSingle()).data
if (!ma) ma = chk('ma', await sb.from('benchtop_edge_profiles').insert({ name: 'Mitred Apron 100', code: 'MA100', category: 'stone', description: 'Apron strip mitred to a 20 slab for a 100 edge (carcass runs up under the slab, fronts drop below the apron).', generates: 'apron', apron_drop_mm: 100, sort_order: 54, active: true }).select('id').single())
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label').eq('room_id', R))
const id = l => cabs.find(c => c.label === l).id
for (const l of ['BC-05', 'BC-07', 'BC-09', 'BC-11'])
  chk(l, await sb.from('cabinet_custom_parts').update({ name: 'Stone Panel', no_cnc: true, edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
    expressions: { dx: 'cab.d + t.door + 2', dy: 'cab.h', dz: 'cab.w' } }).eq('cabinet_instance_id', id(l)).select('id'))
const fg = chk('fg', await sb.from('cabinet_instances').select('face_grid').eq('id', id('BC-03')).single()).face_grid
fg.zones[0].hinge_side = 'right'
chk('bc03', await sb.from('cabinet_instances').update({ dx: 454.4, face_grid: fg }).eq('id', id('BC-03')).select('id'))
const wall2 = chk('w', await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).id
const pts = [{ x: 0, y: 0 }, { x: 5230.6, y: 0 }, { x: 5230.6, y: 670 }, { x: 0, y: 670 }]
const edges = [{ wall: true }, { wall: false, profile_id: ma.id }, { wall: false, profile_id: ma.id }, { wall: true }]
await sb.from('benchtop_instances').delete().eq('room_id', R)
chk('top', await sb.from('benchtop_instances').insert({
  room_id: R, label: 'Benchtop 1', wall_id: wall2, wall_side: 'face', height_mm: 880, benchtop_schedule_id: STONE20,
  notes: '20 stone + 100 mitred apron, 900 top, 670 deep (20 past the 650 fronts). Runs 5 past the #15 stone panel at the open end. Stone panels #9/#11/#13/#15 butt up under it (separate, by stonemason).',
  polygon: pts, edge_tags: [], join_types: [], arc_segments: [], cutout_polygons: [], joins: [],
  segments: pts.map((p0, i) => ({ type: 'line', p0, p1: pts[(i + 1) % 4], edge: edges[i] })),
}).select('id'))
console.log('ok', ma.id)
