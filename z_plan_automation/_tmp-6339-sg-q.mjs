// RHK6339: where is Blackbutt veneer used in the job (before the Spotted Gum change).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const j = (t, x) => console.log(t, JSON.stringify(x))
const P = 'cf31069b-1a56-49ee-91df-dade35f68fde'
j('mats', (await sb.from('materials').select('id,name,dz,parent_id,colour_name,colour_code,face_colour,texture_path,cnc_tool_id').or('name.ilike.%veneer%,name.ilike.%blackbutt%,name.ilike.%spotted%')).data)
const proj = (await sb.from('projects').select('*').eq('id', P).single()).data
j('proj', Object.fromEntries(Object.entries(proj).filter(([k, v]) => v && /material|schedule|style|colour|board|edge/i.test(k))))
const rooms = (await sb.from('rooms').select('*').eq('project_id', P)).data
for (const r of rooms) j('room ' + r.name, Object.fromEntries(Object.entries(r).filter(([k, v]) => v && /id$|material|schedule|style|colour|deleted/i.test(k) && k !== 'project_id')))
