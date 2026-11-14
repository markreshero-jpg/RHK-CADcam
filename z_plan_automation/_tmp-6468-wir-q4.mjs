import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data } = await sb.from('cabinet_instances').select('id,label,wall_id,pos_x,pos_y,pos_z,dx,dy,dz,rotation,notes').eq('room_id', 'dfa682a3-020b-4704-8661-3dbbd6cdf224').order('label')
for (const c of data) console.log(c.label, c.pos_x, c.pos_y, c.pos_z, c.dx, c.dy, c.dz, c.rotation, (c.notes || '').slice(0, 40))
