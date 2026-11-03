import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9'
const { data: c } = await sb.from('cabinet_instances').select('id,label').eq('room_id', R).eq('label', 'WC-03')
const { data, error } = await sb.from('cabinet_custom_parts').select('name,orientation,x,y,z,dx,dy,dz,expressions').eq('cabinet_instance_id', c[0].id)
console.log(error, JSON.stringify(data))
const { data: r } = await sb.from('resolved_parts').select('*').eq('cabinet_instance_id', c[0].id).limit(3)
console.log(JSON.stringify(r)?.slice(0, 800))
