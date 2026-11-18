import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3'
const a = (await sb.from('room_annotations').select('*').eq('room_id', R).gte('updated_at', '2026-11-18T00:00:00Z')).data
for (const x of a) console.log(x.id.slice(0,8), x.view, x.kind, x.wall_id?.slice(0,8), x.cad_layer_id?.slice(0,8), x.created_at, JSON.stringify(x.geom).slice(0,300), '|', (x.text ?? '').replace(/\n/g,' / '), JSON.stringify(x.style).slice(0,120))
for (const t of ['site_sketches','room_markups','markups','room_photos']) { const r = await sb.from(t).select('*').limit(3); console.log(t, r.error?.message ?? JSON.stringify(r.data).slice(0,300)) }
const r = (await sb.from('rooms').select('*').eq('id', R)).data[0]; console.log(Object.keys(r).join(','), r.updated_at)
