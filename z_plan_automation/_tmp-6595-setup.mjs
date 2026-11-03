// RHK6595 job setup (Caloundra Kitchens #3431, 1/21 Parkedge Rd Sunshine Beach):
// LX Colour 16mm Winter Sky (base/tall + panels), LX ABS Grain 18mm Sublime Teak (overheads),
// Handle House C128 Maleny horizontal on bases, overheads push-to-open.
// Project cloned from RHK6592, TOEH 100, kick face Whiteboard 16.5.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) { console.error(what, r.error.message); process.exit(1) } console.log('ok', what); return r.data }
const one = async (q) => (await q).data?.[0]

// Colour = child material of the board + a Colour Range row on the style's schedule.
async function colour({ tplMat, tplDsm, schedule, name, code, finish, face, edge, grain }) {
  let dsm = await one(sb.from('door_schedule_materials').select('id,material_id').eq('schedule_id', schedule).eq('colour_name', name))
  if (dsm) return dsm
  const m = await one(sb.from('materials').select('*').eq('id', tplMat))
  const { id, created_at, updated_at, ...mrest } = m
  const base = m.name.split(' – ')[0]
  const mat = chk(`material ${name}`, await sb.from('materials').insert({ ...mrest, name: `${base} – ${name}`, colour_name: name, finish, face_colour: face, back_colour: grain ? null : face, edge_colour: edge, overridden: [] }).select('id'))[0]
  const d = await one(sb.from('door_schedule_materials').select('*').eq('id', tplDsm))
  const { id: _i, created_at: _c, updated_at: _u, ...drest } = d
  dsm = chk(`colour ${name}`, await sb.from('door_schedule_materials').insert({ ...drest, colour_name: name, colour_code: code, finish, material_id: mat.id, is_default: false, sort_order: 40 }).select('id,material_id'))[0]
  return dsm
}
const sky = await colour({ tplMat: '956250dc-77e8-4d58-988d-99e4629e4f7f', tplDsm: '2efd393b-801c-4f21-b55d-5fa62c4cd87a', schedule: 'e8128310-48ff-49c3-8c22-1e46e6d150f2',
  name: 'Winter Sky', code: 'LX16_WINTER_SKY', finish: 'Flint', face: '#56677a', edge: '#5d6e80', grain: false })
const teak = await colour({ tplMat: 'e6f8c485-c0a0-4c3d-a4aa-6a417cbe24ef', tplDsm: 'c5a5e82f-216b-4962-aa98-0ed6f10605e8', schedule: '476c0c69-7f18-4bb6-bf2c-262884219fdf',
  name: 'Sublime Teak', code: 'LXABS_GRN_SUBLIME_TEAK', finish: 'Absolute Grain', face: '#a8713f', edge: '#b88050', grain: true })

// Handle + schedule
let handle = await one(sb.from('hardware_handles').select('id').eq('name', 'Handle House C128 Maleny'))
if (!handle) {
  const tpl = await one(sb.from('hardware_handles').select('*').eq('id', '847df253-e5c6-4bd8-ae83-1db5ae76eab7'))
  const { id, created_at, updated_at, ...rest } = tpl
  handle = chk('handle', await sb.from('hardware_handles').insert({ ...rest, name: 'Handle House C128 Maleny', length: 140, bore_centres: 128, finish: 'Satin Nickel', notes: 'Handle House Kunda Park. C128 Maleny, 128 centres, satin nickel. Overall length TBC (140 assumed). RHK6595.' }).select('id'))[0]
}
const PTO = 'b199eb9d-a6e0-4b5f-95f6-c751f187db6c'
let hs = await one(sb.from('handle_schedules').select('id').eq('name', 'Handle House Maleny 128'))
if (!hs) {
  hs = chk('handle schedule', await sb.from('handle_schedules').insert({ name: 'Handle House Maleny 128', description: 'Handle House C128 Maleny horizontal on base doors + drawers; overheads push-to-open (fingerpull under)', is_default: false, active: true, handle_id: handle.id }).select('id'))[0]
  chk('handle entries', await sb.from('handle_schedule_entries').insert([
    { schedule_id: hs.id, role: 'door_base', handle_id: handle.id, offset_from_edge_mm: 50, inset_from_side_mm: 50, orientation: 'horizontal' },
    { schedule_id: hs.id, role: 'door_tall', handle_id: handle.id, offset_from_edge_mm: 50, inset_from_side_mm: 50, orientation: 'horizontal' },
    { schedule_id: hs.id, role: 'drawer', handle_id: handle.id, offset_from_edge_mm: 50, inset_from_side_mm: null, orientation: 'horizontal' },
    { schedule_id: hs.id, role: 'door_wall', handle_id: PTO, offset_from_edge_mm: 0, inset_from_side_mm: null, orientation: 'vertical' },
  ]).select('id'))
}

// Project
let proj = await one(sb.from('projects').select('id').eq('job_number', 'RHK6595'))
if (!proj) {
  const tpl = await one(sb.from('projects').select('*').eq('id', 'f801076c-4e6b-4214-b0b6-91e92c2dfa8c'))
  const { id, created_at, updated_at, name, job_number, client_name, client_address, client_id, notes, nest_run_seq, ...defaults } = tpl
  proj = chk('project', await sb.from('projects').insert({
    ...defaults, name: 'RHK6595 CKC - 1/21 Parkedge Rd Sunshine Beach', job_number: 'RHK6595',
    client_name: 'Caloundra Kitchens (Jenny & Greg Kenny)', client_address: '1/21 Parkedge Rd, Sunshine Beach',
    notes: 'Caloundra Kitchens job #3431 (Liam G, 28/10/2026). Upper doors LX ABS Grain 18 Sublime Teak; lower doors + panels LX Colour 16 Winter Sky (Flint); kick 16.5 white; YDL Kalana Bianco 20 stone.',
    default_door_style_id: '8ffd3162-6b06-4abf-9f00-e05caf04eb79',
    base_door_style_id: null, tall_door_style_id: null, wall_door_style_id: '28d45d84-3270-40ad-ae78-7df696bcc388',
    base_door_colour_id: sky.id, tall_door_colour_id: sky.id, wall_door_colour_id: teak.id,
    handle_schedule_id: hs.id, rule_overrides: { ...(tpl.rule_overrides ?? {}), TOEH: 100 },
    class_dimension_defaults: { base: { dy: 930, dz: 560 }, tall: { dy: 2340, dz: 580 }, wall: { dy: 747, dz: 320 } },
  }).select('id'))[0]
  const rows = []
  for (const cls of ['base', 'tall', 'wall']) for (const role of ['exposed', 'door_face'])
    rows.push({ project_id: proj.id, assembly_class: cls, material_role: role, material_id: cls === 'wall' ? teak.material_id : sky.material_id })
  chk('job_materials', await sb.from('job_materials').insert(rows).select('id'))
  chk('toekick', await sb.from('job_toekick_materials').insert({ project_id: proj.id, part_role: 'face', material_id: 'd081b2a1-38a8-472c-a415-f179699a1347' }).select('id'))
}
console.log(JSON.stringify({ project: proj.id, sky, teak, handle: handle.id, handleSchedule: hs.id }))
