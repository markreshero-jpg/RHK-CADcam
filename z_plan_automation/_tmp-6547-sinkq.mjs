import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const r = await sb.from('fixture_catalog').select('id,name,kind,category,width,depth,height,model_url,resizable,stretch,cutout_shape,cutout_w,cutout_d,cutout_radius,bench_drop,cut_benchtop,sort_order,brand,model_no').eq('category', 'sink').order('sort_order')
console.log(r.error ?? r.data.map(x => JSON.stringify(x)).join('\n'))
const u = await sb.from('room_fixtures').select('catalog_id').eq('category', 'sink').limit(1000)
const counts = {}; for (const f of u.data ?? []) counts[f.catalog_id] = (counts[f.catalog_id] ?? 0) + 1; console.log('usage', counts)
process.exit(0)
