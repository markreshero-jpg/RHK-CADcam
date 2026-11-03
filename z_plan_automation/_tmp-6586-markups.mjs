import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const L = (await sb.from('job_cad_layers').select('*').eq('project_id', 'bada385f-41cf-411e-9536-d1e413e6d5ce')).data
console.log(L.map(l => [l.id, l.name]))
const lay = L.filter(l => /markup/i.test(l.name)).map(l => l.id)
const a = (await sb.from('room_annotations').select('*').eq('room_id', 'a496c328-cfda-4f74-8c6d-175edd8e5907').in('cad_layer_id', lay)).data
for (const x of a) console.log(JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k, v]) => v != null && !/created|updated|room_id|project/.test(k)))))
