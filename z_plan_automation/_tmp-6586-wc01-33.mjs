// RHK6586 Lounge WC-01 ledge: top + bottom glued up (Mark 2026-11-19) - fs:top dz 16.5 -> 33 so the
// LED route (9 deep from the top face) references a 33 piece. A re-resolve of WC-01 puts it back to 16.5.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const r = await sb.from('case_parts').update({ dz: 33 }).eq('id', '233baba9-3bfc-4b2d-a23e-b22748c8d364').select('part_key,dx,dy,dz')
console.log(r.error?.message ?? JSON.stringify(r.data))
const { data: ops } = await sb.from('part_operations').select('id,source_part_key,operation_type,plane_kind,pos_x,pos_y,size_dx,size_dy,depth').eq('source_cabinet_id', '4b1d32e8-bb7f-4831-9652-c240f352321f')
console.log(JSON.stringify(ops))
// cleat rebate on fs:top was cut before the glue-up - off CNC for the LED run
const q = await sb.from('part_operations').update({ output_to_cnc: false }).eq('id', '10bb41f5-63bc-4f9f-87b3-473207205f8b').select('id,output_to_cnc,parameters')
console.log(q.error?.message ?? JSON.stringify(q.data))
