import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: s, error } = await sb.from('benchtop_schedules').select('*')
console.log(error?.message, s && Object.keys(s[0]).join(','))
for (const x of s ?? []) console.log(x.id, x.name, x.thickness_mm ?? '', x.material_id ?? '')
const { data: p } = await sb.from('benchtop_edge_profiles').select('id,name').limit(30)
console.log(JSON.stringify(p))
const { data: b } = await sb.from('benchtop_instances').select('*').eq('room_id', 'a321bb6a-1ed6-428b-bcca-6d1946d16345')
console.log(JSON.stringify(b?.[0]).slice(0, 1500))
