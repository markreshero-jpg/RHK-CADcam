import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const j = x => console.log(JSON.stringify(x))
j((await sb.from('cabinet_instances').select('label,dx,dy,dz,pos_z,has_face,has_toekick,top_type,exposed_interior,internal_grid,material_overrides,rule_overrides,part_hide_views,face_grid').eq('room_id', 'b2252689-fdc9-4fd7-be9a-f29853f0391e').in('label', ['WC-03'])).data)
j((await sb.from('cabinet_instances').select('label,dx,dy,dz,pos_z,bulkhead,rule_overrides,face_grid').eq('room_id', '67a27d07-1012-4537-a58d-5d3b50764221')).data)
j((await sb.from('room_annotations').select('cad_layer_id,style').eq('room_id', 'ab417075-b6e2-4189-93c5-c281e1f05f9b').limit(3)).data)
