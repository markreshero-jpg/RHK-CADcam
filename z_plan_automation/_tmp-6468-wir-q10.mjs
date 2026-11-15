import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const f = (await sb.from('cabinet_instances').select('id').eq('room_id', 'dfa682a3-020b-4704-8661-3dbbd6cdf224').eq('label', 'TC-17').single()).data
const cp = (await sb.from('case_parts').select('*').eq('cabinet_instance_id', f.id)).data
for (const p of cp) console.log(p.part_key, p.dx, p.dy, p.dz, p.material_id)
const cu = (await sb.from('cabinet_custom_parts').select('name,x,y,dx,dy,dz').eq('cabinet_instance_id', f.id)).data; console.log(cu)
