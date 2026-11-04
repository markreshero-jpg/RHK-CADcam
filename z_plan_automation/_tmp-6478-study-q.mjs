import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9'
const rm = (await sb.from('rooms').select('project_id').eq('id', R).single()).data
const rooms = (await sb.from('rooms').select('id,name').eq('project_id', rm.project_id)).data
const an = (await sb.from('room_annotations').select('room_id,text,geom,style,cad_layer_id').in('room_id', rooms.map(r => r.id)).eq('view', 'plan')).data
for (const a of an.filter(a => a.style?.block === 'Spec block' || /^SITE NOTES/.test(a.text ?? ''))) console.log(rooms.find(r => r.id === a.room_id).name, JSON.stringify(a.geom), a.cad_layer_id, '\n', a.text, '\n')
const m = (await sb.from('room_materials').select('*').eq('room_id', R)).data
console.log(JSON.stringify(m))
