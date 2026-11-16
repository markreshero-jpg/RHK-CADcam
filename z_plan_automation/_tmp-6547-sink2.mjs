// RHK6547 Laundry rev 3 (Mark 2026-11-16): our normal single bowl (Abi Ohelu, stretched to 450 x 450)
// in place of the generic box sink. Still cut_benchtop false: the cut-out shows as dashed CAD only (_tmp-6547-cad.mjs).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ok = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '20601f2b-4fa7-49c1-bfff-36d1d53ed308', GENERIC = 'ab4a436d-80fc-42b9-8552-b75708dcab30', OHELU = 'ab1c3583-04c1-4105-aa8c-8cf2c54574a5'
const BENCH = 900, CX = 1690, CY = 320, W = 450, D = 450
const keys = ['category', 'kind', 'name', 'width', 'depth', 'height', 'mount', 'colour', 'model_url', 'model_format', 'model_scale', 'model_rot_x', 'model_rot_y', 'model_off_x', 'model_off_y', 'model_off_z', 'cutout_shape', 'cutout_w', 'cutout_d', 'cutout_radius', 'cutout_off_x', 'cutout_off_y', 'bench_drop', 'plan_shape', 'elev_shape', 'resizable', 'stretch', 'brand', 'model_no']
const cat = ok('cat', await sb.from('fixture_catalog').select('*').eq('id', OHELU).single())
const old = ok('old', await sb.from('room_fixtures').select('id,wall_id').eq('room_id', R).eq('catalog_id', GENERIC))
const have = ok('have', await sb.from('room_fixtures').select('id').eq('room_id', R).eq('catalog_id', OHELU))
const wall = old[0]?.wall_id ?? ok('w', await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).id
// rim 15 each side like the catalog (380 -> 350 cut-out): 450 -> 420
const row = { room_id: R, catalog_id: cat.id, ...Object.fromEntries(keys.map(k => [k, cat[k]])), width: W, depth: D, cutout_w: W - 30, cutout_d: D - 30,
  x: CX - W / 2, y: CY - D / 2, rotation: 0, z: BENCH - cat.bench_drop, wall_id: wall, cut_benchtop: false, label: 'Single bowl sink 450 x 450 (cut-out on site)' }
if (have.length) ok('upd', await sb.from('room_fixtures').update(row).eq('id', have[0].id)); else ok('ins', await sb.from('room_fixtures').insert(row))
if (old.length) ok('del', await sb.from('room_fixtures').delete().in('id', old.map(o => o.id)))
console.log(JSON.stringify(ok('fx', await sb.from('room_fixtures').select('label,name,x,y,z,width,depth,cutout_w,cutout_d,cut_benchtop').eq('room_id', R))))
console.log('scale', JSON.stringify(ok('r', await sb.from('rooms').select('annotation_scale').eq('id', R).single())))
process.exit(0)
