import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
let r = await sb.from('cabinet_definitions').select('*').limit(1); console.log(Object.keys(r.data?.[0] ?? {}), r.error?.message)
r = await sb.from('projects').select('*').eq('id', '21601535-e1c8-4087-96b8-bb2506b96c3d').single(); const p = r.data
console.log(Object.fromEntries(Object.entries(p).filter(([k, v]) => /rule|style|toe|kick|height|colour/i.test(k))))
r = await sb.from('cabinet_instances').select('label,definition_code,dx,dy,dz,face_grid,internal_grid,rule_overrides').eq('room_id', '874fed25-8e1b-4bbf-b1ff-3090361b5dad').limit(3); console.log(r.error?.message, JSON.stringify(r.data?.[0])?.slice(0, 400))
