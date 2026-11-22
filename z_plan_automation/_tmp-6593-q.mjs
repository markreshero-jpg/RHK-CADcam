// RHK6593: BC-04 case parts (rail positions) + a placed BBQ row for the insert pattern.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const r = await sb.from('case_parts').select('*').eq('cabinet_instance_id', '73307bb7-d525-40e5-802e-222fcc13d935')
if (r.error) console.log(r.error.message); else { console.log(Object.keys(r.data[0] ?? {}).join(',')); for (const p of r.data) console.log(p.part_key, p.name, 'pos', p.pos_x ?? p.x, p.pos_y ?? p.y, p.pos_z ?? p.z, 'size', p.dx, p.dy, p.dz) }
const b = await sb.from('room_fixtures').select('room_id,name,x,y,z,rotation,width,depth,height,bench_drop,cabinet_id,link_x,link_z,label,display_name').eq('kind', 'BBQ')
for (const x of b.data ?? []) console.log(JSON.stringify(x))
