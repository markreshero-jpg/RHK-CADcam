import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3'
const cat = await sb.from('fixture_catalog').select('id,category,kind,name,brand,model_no,width,depth,height,mount,bench_drop,cutout_shape,cutout_w,cutout_d,cutout_radius,model_url,active').eq('active', true).in('category', ['sink', 'appliance', 'tap'])
for (const c of cat.data) console.log('CAT', c.id.slice(0, 8), c.category, c.kind, '|', c.name, '|', c.brand, c.model_no, c.width, c.depth, c.height, c.mount, 'drop', c.bench_drop, 'cut', c.cutout_shape, c.cutout_w, c.cutout_d, c.cutout_radius, c.model_url ? 'GLB' : '')
const cab = await sb.from('cabinet_instances').select('*').eq('room_id', R).in('label', ['WC-03', 'BC-02', 'BC-04'])
for (const c of cab.data ?? []) console.log('CAB', c.label, JSON.stringify(Object.fromEntries(Object.entries(c).filter(([k, v]) => v !== null && /label|code|width|height|depth|rangehood|cutout|x$|y$|wall|id$|^z/.test(k)))).slice(0, 900))
