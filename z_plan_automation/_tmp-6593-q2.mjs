// RHK6593 read-only: benchtop row, edge profiles, BC-04 / BC-05, fixtures, elevation notes.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'daf418a3-f01d-48dd-abe4-053e6a97b084'
const tops = await sb.from('benchtop_instances').select('*').eq('room_id', R)

for (const t of []) {
  const r = await sb.from(t).select('*').limit(40)
  console.log(t, r.error ? r.error.message : JSON.stringify(r.data).slice(0, 3000))
}
const cabs = await sb.from('cabinet_instances').select('*').eq('room_id', R).order('pos_x')
for (const c of cabs.data) console.log('CAB', JSON.stringify(c).slice(0, 900))
const fx = await sb.from('room_fixtures').select('*').eq('room_id', R)
console.log('FX', JSON.stringify(fx.data))
const an = await sb.from('room_annotations').select('id,view,kind,geom,text,style').eq('room_id', R)
for (const a of an.data) console.log('AN', JSON.stringify(a).slice(0, 400))
