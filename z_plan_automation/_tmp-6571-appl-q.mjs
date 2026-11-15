// RHK6571 Kitchen appliances: room fixtures, catalogue candidates, WC-03 rangehood, TBC annotations.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3'
const fx = await sb.from('room_fixtures').select('*').eq('room_id', R)
for (const f of fx.data) console.log('FIX', JSON.stringify(Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== null && !/model_url|glb|created|updated/.test(k)))).slice(0, 900))
const cat = await sb.from('fixture_catalog').select('id,name,group_name,width,depth,height,bench_drop,mount,cutout_w,cutout_d').order('group_name')
if (cat.error) { const c2 = await sb.from('fixture_catalog').select('*').limit(1); console.log('cols', Object.keys(c2.data[0])) }
else for (const c of cat.data) console.log('CAT', JSON.stringify(c))
const cab = await sb.from('cabinet_instances').select('label,cabinet_code,width,height,depth,rangehood,part_cutouts,params').eq('room_id', R).in('label', ['WC-03', 'BC-02', 'BC-04'])
console.log(cab.error?.message); for (const c of cab.data ?? []) console.log('CAB', JSON.stringify(c).slice(0, 1500))
const an = await sb.from('room_annotations').select('id,view,kind,text,style,wall_id,geom').eq('room_id', R)
for (const a of an.data) if (a.text) console.log('ANN', a.id, a.view, a.kind, JSON.stringify(a.text).slice(0, 300), a.style?.src ?? '', a.style?.block ?? '')
