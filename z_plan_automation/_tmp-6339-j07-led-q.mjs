import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef'
const c = (await sb.from('cabinet_instances').select('id,label,pos_x,pos_y,dx,updated_at').eq('room_id', R).in('label', ['WC-01', 'WC-02'])).data
console.log(JSON.stringify(c))
const top = c.find(x => x.label === 'WC-02')
console.log(JSON.stringify((await sb.from('cabinet_custom_parts').select('id,x,dx,dy,updated_at,expressions').eq('cabinet_instance_id', top.id)).data))
console.log(JSON.stringify((await sb.from('part_operations').select('id,pos_x,pos_y,size_dy,source_part_key').eq('source_cabinet_id', top.id)).data))
