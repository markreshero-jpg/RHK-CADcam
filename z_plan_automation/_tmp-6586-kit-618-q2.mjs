import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const c=(await sb.from('cabinet_instances').select('*').eq('room_id','a496c328-cfda-4f74-8c6d-175edd8e5907').in('label',['KICK 3','WC-12','TC-07','TC-08'])).data
for(const x of c) console.log(x.label,JSON.stringify({px:x.pos_x,py:x.pos_y,pz:x.pos_z,dx:x.dx,dy:x.dy,dz:x.dz,fp:x.footprint,ov:x.param_overrides??x.overrides,kr:x.kick_run_id,tk:x.has_toekick}))
for(const x of c){const p=(await sb.from('cabinet_custom_parts').select('name,x,y,z,dx,dy,dz').eq('cabinet_instance_id',x.id)).data;if(p?.length)console.log(x.label,'custom',JSON.stringify(p))}
