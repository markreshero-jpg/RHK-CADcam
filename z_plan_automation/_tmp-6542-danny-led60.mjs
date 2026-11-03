// RHK6542 Danny's Robe: TC-03 LED route 60 back from the front (was 50).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a'
const cab = (await sb.from('cabinet_instances').select('id').eq('room_id', R).eq('label', 'TC-03').single()).data
const ops = (await sb.from('part_operations').select('*').eq('source_cabinet_id', cab.id).eq('operation_type', 'route')).data
for (const o of ops) console.log(o.id, o.source_part_key, o.plane_kind, o.pos_x, o.pos_y, o.width ?? '', o.length ?? '', o.depth ?? '')
const led = ops.filter(o => Math.abs(o.pos_x - 520.75) < 0.01)
for (const o of led) console.log('upd', (await sb.from('part_operations').update({ pos_x: 510.75 }).eq('id', o.id)).error?.message ?? 'ok')
const n = (await sb.from('room_annotations').select('id,text').eq('room_id', R).like('text', 'COB LED%').single()).data
console.log('note', (await sb.from('room_annotations').update({ text: n.text.replace('50 BACK', '60 BACK') }).eq('id', n.id)).error?.message ?? 'ok')
