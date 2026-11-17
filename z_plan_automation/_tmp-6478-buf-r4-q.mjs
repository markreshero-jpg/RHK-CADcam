// RHK6478 Buffet rev 4 query: cabinets (dz/def/material/part_cutouts), custom parts, annotations
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = process.argv[2] ?? '0df13af4-8a6f-438f-a10d-6a9b4754aa97'
const { data: cabs } = await sb.from('cabinet_instances').select('*').eq('room_id', R).order('label')
const skip = new Set(['face_grid','internal_grid','created_at','updated_at','room_id','notes'])
for (const c of cabs) { const o = {}; for (const [k, v] of Object.entries(c)) if (!skip.has(k) && v !== null && v !== false && !(typeof v === 'object' && Object.keys(v).length === 0)) o[k] = v; console.log('\n' + c.label, JSON.stringify(o).slice(0, 1500)) }
const { data: cps } = await sb.from('cabinet_custom_parts').select('*').in('cabinet_instance_id', cabs.map(c => c.id))
for (const p of cps) console.log('\nCP', cabs.find(c => c.id === p.cabinet_instance_id).label, JSON.stringify(p).slice(0, 900))
const { data: anns } = await sb.from('room_annotations').select('id,view,kind,text,geom,wall_id').eq('room_id', R)
for (const a of anns) if (a.kind === 'text') console.log('ANN', a.view, a.id.slice(0,8), JSON.stringify(a.text).slice(0, 200), JSON.stringify(a.geom).slice(0,120))
console.log('ann total', anns.length)
process.exit(0)
