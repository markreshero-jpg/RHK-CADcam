// RHK6547 Laundry rev 2 (Mark 2026-11-16): sink for the visual only (cut-out on site), top edged front + both ends.
// Generic 450 x 450 drop-in sink catalog row (no GLB yet) + Abey Lucia gooseneck as a stand-in tap; both cut_benchtop false.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ok = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '20601f2b-4fa7-49c1-bfff-36d1d53ed308', TAP = '2d62af70'
const BENCH = 900, CX = 1690 // BC-02 centre (1190 + 500)

// top edging: front + both ends (same mapping as RHK6599 WC-06/07)
const top = ok('top', await sb.from('cabinet_instances').select('id').eq('room_id', R).eq('label', 'WC-03').single())
ok('edge', await sb.from('cabinet_custom_parts').update({ edge_top: true, edge_left: true, edge_right: true, edge_bottom: false }).eq('cabinet_instance_id', top.id))
ok('note', await sb.from('cabinet_instances').update({ notes: 'Benchtop 18 LX Elegant Oak, 1500 x 605, edged front + both ends. Sink cut-out on site (450 x 450 drop-in by others)' }).eq('id', top.id))

const keys = ['category', 'kind', 'name', 'width', 'depth', 'height', 'mount', 'colour', 'model_url', 'model_format', 'model_scale', 'model_rot_x', 'model_rot_y', 'model_off_x', 'model_off_y', 'model_off_z', 'cutout_shape', 'cutout_w', 'cutout_d', 'cutout_radius', 'cutout_off_x', 'cutout_off_y', 'bench_drop', 'plan_shape', 'elev_shape', 'resizable', 'stretch', 'brand', 'model_no']
let sink = ok('s', await sb.from('fixture_catalog').select('*').eq('name', 'Generic 450 x 450 drop-in sink')).at(0)
if (!sink) sink = ok('sink cat', await sb.from('fixture_catalog').insert({ category: 'sink', kind: 'Kitchen sink', name: 'Generic 450 x 450 drop-in sink',
  width: 450, depth: 450, height: 180, mount: 'benchtop', colour: '#ced8e3', notes: 'Generic 450 x 450 drop-in (inset) sink placeholder (RHK6547, 2026-11-16). Cut-out approx 420 x 420.',
  active: true, sort_order: 201, cutout_shape: 'rect', cutout_w: 420, cutout_d: 420, cutout_radius: 10, bench_drop: 180, cut_benchtop: false, resizable: false }).select('*').single())
const tap = ok('tap', await sb.from('fixture_catalog').select('*').eq('name', 'Abey Lucia Gooseneck Sink Mixer').single())
if (!tap.id.startsWith(TAP)) throw new Error('tap id ' + tap.id)
const wall2 = ok('w', await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single())
const have = ok('fx', await sb.from('room_fixtures').select('id,catalog_id').eq('room_id', R))
const rows = []
// sink centre 320 off the wall (top 605 deep), tap behind it on the cupboard centre
if (!have.some(f => f.catalog_id === sink.id)) rows.push({ room_id: R, catalog_id: sink.id, ...Object.fromEntries(keys.map(k => [k, sink[k]])),
  x: CX - 225, y: 320 - 225, rotation: 0, z: BENCH - sink.bench_drop, wall_id: wall2.id, cut_benchtop: false, label: '450 x 450 drop-in sink (by others, cut on site)' })
if (!have.some(f => f.catalog_id === tap.id)) rows.push({ room_id: R, catalog_id: tap.id, ...Object.fromEntries(keys.map(k => [k, tap[k]])),
  x: CX - tap.width / 2, y: 20, rotation: 0, z: BENCH, wall_id: wall2.id, cut_benchtop: false, label: 'Tap (by others, visual only)' })
if (rows.length) ok('ins', await sb.from('room_fixtures').insert(rows))
console.log('fixtures', JSON.stringify(ok('fx', await sb.from('room_fixtures').select('label,x,y,z,width,depth,cut_benchtop').eq('room_id', R))))
process.exit(0)
