import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const j = (t, x) => console.log(t, JSON.stringify(x))
const P = 'cf31069b-1a56-49ee-91df-dade35f68fde'
const BB = ['0bed0f26-d551-4c03-ba6a-fd7f3309b6ad', 'fca041dc-30b7-469e-9e14-d8d3aae38a57']
const rooms = (await sb.from('rooms').select('id,name').eq('project_id', P)).data
const RID = rooms.map(r => r.id)
j('door colour', (await sb.from('door_schedule_materials').select('*').eq('id', 'b5c7f263-7968-41e7-89be-2d9d36029aec')).data)
j('door style', (await sb.from('door_styles').select('*').eq('id', '28b8b729-5862-40ef-99be-b46f89325ab7')).data)
j('job_materials', (await sb.from('job_materials').select('*').eq('project_id', P)).data)
j('room_materials', (await sb.from('room_materials').select('*').in('room_id', RID)).data)
j('edge tapes', (await sb.from('edge_banding').select('*').or(`material_match_id.in.(${BB.join(',')}),name.ilike.%blackbutt%,name.ilike.%spotted%`)).data)
const cabs = (await sb.from('cabinet_instances').select('id,label,room_id,material_overrides,toekick_overrides,edge_overrides').in('room_id', RID)).data
for (const c of cabs) { const s = JSON.stringify([c.material_overrides, c.toekick_overrides, c.edge_overrides]); if (/[0-9a-f-]{36}/.test(s)) j('cab ' + rooms.find(r => r.id === c.room_id).name + ' ' + c.label, [c.material_overrides, c.toekick_overrides, c.edge_overrides]) }
const cps = (await sb.from('cabinet_custom_parts').select('cabinet_instance_id,name,material_id,material_override_id,edge_band_id').in('cabinet_instance_id', cabs.map(c => c.id))).data
for (const p of cps) j('cp ' + cabs.find(c => c.id === p.cabinet_instance_id).label + ' ' + p.name, [p.material_id, p.material_override_id, p.edge_band_id])
j('construction sched', (await sb.from('construction_schedules').select('*').eq('id', '637e72bb-0f16-4a64-98a9-115a6034322e')).data)
