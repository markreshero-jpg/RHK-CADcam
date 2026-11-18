import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const j = (t, x) => console.log(t, JSON.stringify(x))
j('asm', (await sb.from('assembly_schedules').select('id,name').eq('id', '9eb520cf-8649-4c0e-a5a6-51b451a1fc56')).data)
j('asm rows', (await sb.from('assembly_schedule_rows').select('assembly_class,material_role,material_id,edgeband_id').eq('schedule_id', '9eb520cf-8649-4c0e-a5a6-51b451a1fc56')).data)
const tk = (await sb.from('toekick_schedules').select('id,name').eq('is_default', true).maybeSingle()).data
j('tk', tk); j('tk rows', (await sb.from('toekick_schedule_rows').select('part_role,material_id').eq('schedule_id', tk?.id)).data)
j('door range', (await sb.from('door_schedule_materials').select('id,colour_name,material_id,edgeband_id').eq('schedule_id', '36a53373-209f-401e-8e71-cfe46c7cefd2')).data)
j('jobs using range colour b5c7', (await sb.from('projects').select('job_number,name').or('base_door_colour_id.eq.b5c7f263-7968-41e7-89be-2d9d36029aec,wall_door_colour_id.eq.b5c7f263-7968-41e7-89be-2d9d36029aec,tall_door_colour_id.eq.b5c7f263-7968-41e7-89be-2d9d36029aec')).data)
const rk = (await sb.from('rooms').select('id,name,base_door_colour_id,toekick_schedule_id,assembly_schedule_id,front_schedule_id').eq('project_id', 'cf31069b-1a56-49ee-91df-dade35f68fde')).data
j('rooms', rk)
j('cabs with kick exposed?', (await sb.from('cabinet_instances').select('label,toekick_overrides').in('room_id', rk.map(r => r.id)).eq('is_kick_assembly', true)).data)
