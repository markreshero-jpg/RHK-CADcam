import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: c } = await sb.from('cabinet_instances').select('id').eq('room_id', 'f98db01e-14e2-454d-8c80-a48567bcc20e').eq('label', 'TC-01').single()
const { data: cp } = await sb.from('case_parts').select('part_key,dx,dy,y').eq('cabinet_instance_id', c.id).order('part_key')
console.log(JSON.stringify(cp.map(p => [p.part_key, p.dx, p.dy, p.y])))
const { data: tk } = await sb.from('toekick_parts').select('part_key,dx,dy,material_id').eq('cabinet_instance_id', c.id)
console.log(JSON.stringify(tk))
const { data: fz } = await sb.from('face_zones').select('col_index,facing').eq('cabinet_instance_id', c.id)
console.log(JSON.stringify(fz))
