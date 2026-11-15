import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3'
const t = await sb.from('fixture_catalog').select('id,name,cutout_off_x,cutout_off_y,width,depth,plan_shape,stretch').in('id', ['2d62af70-0000'].concat([]) ).limit(1)
const all = await sb.from('fixture_catalog').select('id,name,cutout_off_x,cutout_off_y,width,depth,stretch,resizable').or('name.ilike.%Lucia Gooseneck%,name.ilike.%Seba%,name.ilike.%Induction cooktop 600%,name.ilike.%Miele 60cm%,name.ilike.%Generic oven%')
for (const c of all.data) console.log(JSON.stringify(c))
const an = await sb.from('room_annotations').select('id,view,kind,text,origin,user_edited_at,cad_layer_id,wall_id,geom').eq('room_id', R)
for (const a of an.data) console.log(a.id.slice(0, 8), a.view, a.kind, a.origin, a.user_edited_at, JSON.stringify(a.text ?? '').slice(0, 50), a.kind === 'cloud' ? JSON.stringify(a.geom).slice(0, 120) : '')
// other jobs: a tap placed with a sink, to copy the offset pattern
const fx = await sb.from('room_fixtures').select('room_id,name,x,y,z,rotation,width,depth,cutout_off_x,cutout_off_y').eq('category', 'tap').limit(6)
for (const f of fx.data) console.log('TAP', JSON.stringify(f))
