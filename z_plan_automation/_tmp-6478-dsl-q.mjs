// RHK6478 DS Linen pre-nest query: materials, room schedules, handle schedule, TC-02 parts
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = process.argv[2] ?? 'f1953ab4-a03b-4439-a777-d39476156f31'
const { data: room } = await sb.from('rooms').select('*').eq('id', R).single()
console.log('room', JSON.stringify(Object.fromEntries(Object.entries(room).filter(([k, v]) => v !== null && /mat|sched|handle|door|colour|kick|edge/.test(k)))))
const { data: mats } = await sb.from('materials').select('id,name,thickness').in('id', ['d081b2a1-38a8-472c-a415-f179699a1347', 'b07a7e40-facd-4cdf-8856-60712e940b44'])
console.log(JSON.stringify(mats))
const { data: rm } = await sb.from('room_materials').select('*').eq('room_id', R)
console.log('room_materials', JSON.stringify(rm).slice(0, 800))
const { data: cabs } = await sb.from('cabinet_instances').select('id,label').eq('room_id', R)
const tc2 = cabs.find(c => c.label === 'TC-02').id
const { data: cp } = await sb.from('case_parts').select('part_key,dx,dy,dz,material_id,edge_band_top,edge_band_bottom,edge_band_left,edge_band_right').eq('cabinet_instance_id', tc2)
for (const p of cp) console.log('case', JSON.stringify(p))
const { data: ip } = await sb.from('internal_parts').select('part_type,dx,dy,dz,material_id').eq('cabinet_instance_id', tc2)
for (const p of ip) console.log('int', JSON.stringify(p))
const { data: fz } = await sb.from('face_zones').select('face_type,dx,dy,dz,material_id,edge_band_top,edge_band_bottom,edge_band_left,edge_band_right').eq('cabinet_instance_id', tc2)
for (const p of fz) console.log('face', JSON.stringify(p))
const ids = [...new Set([...cp, ...ip, ...fz].map(p => p.material_id))]
const { data: m2 } = await sb.from('materials').select('id,name,thickness').in('id', ids)
console.log(JSON.stringify(m2))
process.exit(0)
