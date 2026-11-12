import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const j = x => console.log(JSON.stringify(x))
const J4 = 'b2252689-fdc9-4fd7-be9a-f29853f0391e', R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef'
j((await sb.from('walls').select('*').eq('room_id', J4)).data)
j((await sb.from('walls').select('*').eq('room_id', R)).data)
const bc4 = (await sb.from('cabinet_instances').select('*').eq('room_id', J4).eq('label', 'BC-04').single()).data
j({ ...bc4, face_grid: undefined, internal_grid: undefined })
j((await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', bc4.id)).data)
j((await sb.from('room_annotations').select('kind,text,geom,style').eq('room_id', J4).eq('view', 'elevation')).data?.filter(a => a.kind !== 'text').slice(0, 4))
j((await sb.from('room_annotations').select('kind').eq('room_id', R)).data)
j((await sb.from('cabinet_instances').select('label,pos_x,pos_y,rotation,dx,dz').eq('room_id', R).in('label', ['TC-03', 'WC-02', 'BC-01'])).data)
