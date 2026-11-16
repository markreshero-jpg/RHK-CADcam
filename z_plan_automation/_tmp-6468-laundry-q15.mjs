import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '874fed25-8e1b-4bbf-b1ff-3090361b5dad'
const dsm = (await sb.from('door_schedule_materials').select('*')).data
console.log('COLS', Object.keys(dsm[0]).join(','))
for (const id of ['7917b996-9833-42a7-8910-a2b3f1c02c81', '827dfe38-7cb7-4c02-aa87-6916b09876f5']) console.log('ROW', JSON.stringify(dsm.find(r => r.id === id)))
console.log('2PAC SCHED', JSON.stringify(dsm.filter(r => r.door_material_schedule_id === 'bec37dbd-7fd1-44c7-acc1-38c74981e059' || r.schedule_id === 'bec37dbd-7fd1-44c7-acc1-38c74981e059').map(r => ({ id: r.id, n: r.colour_name ?? r.name, m: r.material_id }))))
const rm = await sb.from('room_materials').select('*').eq('room_id', R)
console.log('ROOM_MATS', JSON.stringify(rm.data ?? rm.error))
const km = await sb.from('room_materials').select('*').eq('room_id', '58bac32f-cdca-4a86-a1a4-c29af7ef9430')
console.log('KIT_MATS', JSON.stringify(km.data ?? km.error))
const mats = (await sb.from('materials').select('id,name,dz,colour_name,parent_id').or('name.ilike.%satin%,name.ilike.%2 pac%,name.ilike.%2pac%')).data
console.log('MATS', JSON.stringify(mats))
