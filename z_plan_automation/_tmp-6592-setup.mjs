// RHK6592 job setup: 2pac Classic White Satin colour, CabinetWare 128 square handle schedule,
// project cloned from RHK6590 (2pac 18, Dragon Pro Silk White), TOEH 110, kick face whiteboard 16.5.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) { console.error(what, r.error.message); process.exit(1) } console.log('ok', what); return r.data }
const one = async (q) => (await q).data?.[0]

// 1. 2pac colour
let colour = await one(sb.from('door_schedule_materials').select('id').eq('schedule_id', 'bec37dbd-7fd1-44c7-acc1-38c74981e059').eq('colour_name', 'Classic White Satin'))
if (!colour) {
  const tpl = await one(sb.from('door_schedule_materials').select('*').eq('id', '651a3032-d6c1-455c-898e-d61beeab26f6'))
  const { id, created_at, updated_at, ...rest } = tpl
  colour = chk('colour', await sb.from('door_schedule_materials').insert({ ...rest, colour_name: 'Classic White Satin', colour_code: 'Classic White', finish: 'Satin', is_default: false, sort_order: 2 }).select('id'))[0]
}
// 2. handle + schedule
let handle = await one(sb.from('hardware_handles').select('id').eq('name', 'CabinetWare All Square Handle 128'))
if (!handle) {
  const tpl = await one(sb.from('hardware_handles').select('*').eq('id', '862e1c25-5ccb-4e02-aeb9-cbe5ab50099a'))
  const { id, created_at, updated_at, ...rest } = tpl
  handle = chk('handle', await sb.from('hardware_handles').insert({ ...rest, name: 'CabinetWare All Square Handle 128', brand: 'CabinetWare', length: 140, bore_centres: 128, finish: 'TBC', notes: 'RHK6592 (Caloundra Kitchens spec). Length + finish TBC.' }).select('id'))[0]
}
let hs = await one(sb.from('handle_schedules').select('id').eq('name', 'CabinetWare Square 128'))
if (!hs) {
  hs = chk('handle schedule', await sb.from('handle_schedules').insert({ name: 'CabinetWare Square 128', description: 'CabinetWare All Square 128 on doors (vertical) and drawers (horizontal)', is_default: false, active: true, handle_id: handle.id }).select('id'))[0]
  const ents = (await sb.from('handle_schedule_entries').select('*').eq('schedule_id', '4f665e30-de54-4e1e-8d31-e6e7d3e30236')).data
  chk('handle entries', await sb.from('handle_schedule_entries').insert(ents.map(({ id, created_at, ...e }) => ({ ...e, schedule_id: hs.id, handle_id: handle.id }))).select('id'))
}
// 3. project
let proj = await one(sb.from('projects').select('id').eq('job_number', 'RHK6592'))
if (!proj) {
  const tpl = await one(sb.from('projects').select('*').eq('id', '7032a6fe-be8c-499c-8ff8-315dfd61e790'))
  const { id, created_at, updated_at, name, job_number, client_name, client_address, client_id, notes, ...defaults } = tpl
  proj = chk('project', await sb.from('projects').insert({
    ...defaults, name: 'RHK6592 Caloundra Kitchens - Flaxton', job_number: 'RHK6592',
    client_name: 'Caloundra Kitchens + Carpentry (Jayson Waters)', client_address: '296 Flaxton Dr, Flaxton',
    notes: 'Caloundra Kitchens job #3738 (Liam G, 10/10/2026). 2pac Classic White Satin on 18 satin board; butlers open shelving PT 16 Classic White Matt.',
    default_door_style_id: 'bd2b9178-5b77-4a52-b7a1-cc3765ed4bb4',
    base_door_style_id: null, wall_door_style_id: null, tall_door_style_id: null,
    base_door_colour_id: colour.id, wall_door_colour_id: colour.id, tall_door_colour_id: colour.id,
    handle_schedule_id: hs.id, rule_overrides: { ...(tpl.rule_overrides ?? {}), TOEH: 110 },
  }).select('id'))[0]
  const jm = (await sb.from('job_materials').select('*').eq('project_id', tpl.id)).data
  chk('job_materials', await sb.from('job_materials').insert(jm.map(({ id, ...m }) => ({ ...m, project_id: proj.id }))).select('id'))
  chk('toekick', await sb.from('job_toekick_materials').insert({ project_id: proj.id, part_role: 'face', material_id: 'd081b2a1-38a8-472c-a415-f179699a1347' }).select('id'))
}
console.log(JSON.stringify({ project: proj.id, colour: colour.id, handle: handle.id, handleSchedule: hs.id }))
