import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const P = 'cf31069b-1a56-49ee-91df-dade35f68fde'
const ids = ['0bed0f26-d551-4c03-ba6a-fd7f3309b6ad', 'fca041dc-30b7-469e-9e14-d8d3aae38a57', 'c8046201-5e80-41a4-9696-d02d7ee10b32', '579bc59a-744a-434c-8d36-0d74b29b98ce', 'b5c7f263-7968-41e7-89be-2d9d36029aec']
const rooms = (await sb.from('rooms').select('*').eq('project_id', P)).data
const cabs = (await sb.from('cabinet_instances').select('*').in('room_id', rooms.map(r => r.id))).data
for (const c of cabs) for (const [k, v] of Object.entries(c)) { const s = JSON.stringify(v); for (const id of ids) if (s?.includes(id)) console.log(rooms.find(r => r.id === c.room_id).name, c.label, k, id.slice(0, 8)) }
for (const r of rooms) for (const [k, v] of Object.entries(r)) { const s = JSON.stringify(v); for (const id of ids) if (s?.includes(id)) console.log('room', r.name, k, id.slice(0, 8)) }
const fz = (await sb.from('face_zones').select('*').in('cabinet_instance_id', cabs.map(c => c.id))).data
const seen = new Set()
for (const z of fz) for (const [k, v] of Object.entries(z)) { const s = JSON.stringify(v); for (const id of ids) if (s?.includes(id)) seen.add(k + ' ' + id.slice(0, 8)) }
console.log('face_zones cols', [...seen])
const bt = (await sb.from('benchtop_instances').select('label,room_id,material_id,benchtop_schedule_id').in('room_id', rooms.map(r => r.id))).data
console.log('benchtops', JSON.stringify(bt?.map(b => [b.label, b.material_id])))
