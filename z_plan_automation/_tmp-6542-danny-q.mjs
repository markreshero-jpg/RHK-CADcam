import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^"|"$/g,'')]}))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R='830e087b-d817-4843-b766-5fbdd8ee6c4a'
console.log(JSON.stringify((await sb.from('walls').select('*').eq('room_id',R).order('name')).data,null,0))
console.log(JSON.stringify((await sb.from('rooms').select('room_dy,wall_cabinet_top').eq('id',R).single()).data))
console.log(JSON.stringify((await sb.from('room_annotations').select('id,text,geom').eq('room_id',R)).data.map(a=>[a.text.slice(0,40),a.geom])))
console.log(JSON.stringify((await sb.from('cabinet_instances').select('label,pos_x,dx,dy,bulkhead').eq('room_id',R).order('label')).data.map(c=>[c.label,c.pos_x,c.dx,c.dy, c.bulkhead?.auto_h])))
