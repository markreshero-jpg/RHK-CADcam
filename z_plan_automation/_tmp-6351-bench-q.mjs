import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const p = (await sb.from('projects').select('*').eq('job_number', 'RHK6351').single()).data
const pick = Object.fromEntries(Object.entries(p).filter(([k,v]) => /door|rule|kick|toe|height|top|depth|dimension|schedule|construction/i.test(k)))
console.log(p.id, p.name, JSON.stringify(pick))
const rooms = (await sb.from('rooms').select('id,name,deleted_at,rule_overrides,class_dimension_defaults').eq('project_id', p.id)).data
console.log(JSON.stringify(rooms))
for (const r of rooms) { const c = await sb.from('cabinet_instances').select('id', { count: 'exact', head: true }).eq('room_id', r.id); console.log(r.name, c.count) }
const jm = await sb.from('job_materials').select('*').eq('project_id', p.id); console.log('job_materials', JSON.stringify(jm.data ?? jm.error))
