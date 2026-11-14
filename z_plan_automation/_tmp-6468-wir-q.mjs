import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const P = '21601535-e1c8-4087-96b8-bb2506b96c3d'
const { data: rooms } = await sb.from('rooms').select('*').eq('project_id', P)
console.log(rooms.map(r=>({id:r.id,name:r.name,dy:r.room_dy,wct:r.wall_cabinet_top,rules:r.rules??r.rule_overrides,style:r.door_style_override_id,col:r.base_door_colour_id})))
const wir = rooms.find(r => /robe/i.test(r.name))
for (const t of ['walls', 'cabinet_instances', 'room_annotations', 'room_fixtures']) {
  const { data, error } = await sb.from(t).select('id').eq('room_id', wir.id); console.log(t, data?.length, error?.message)
}
const { data: pr } = await sb.from('projects').select('rules,default_door_style_id').eq('id', P).single(); console.log(pr)
const { data: lr } = await sb.from('room_toekick_materials').select('*').eq('room_id', '874fed25-8e1b-4bbf-b1ff-3090361b5dad'); console.log('laundry kick', lr)
const { data: defs } = await sb.from('cabinet_definitions').select('code,name').in('code', ['T2D', 'T1D', 'D4-SSSL', 'D4', 'B1D', 'W2D', 'TEPF', 'TFKW', 'TFK', 'WUP', 'BH', 'TEPK', 'B2D']); console.log(defs)
