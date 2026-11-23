// RHK6603 CKC - WIR - 1/38 Westaway Pde Currimundi: job set-up (Mark 2026-11-23).
// Fronts / seen parts 16 PT Colour Matt Designer White Matt, internals Whiteboard 16.5,
// 33 PT Bottochino top + floating shelf (3600 sheet), CabinetWare All Square 128 handles, kick 100 Whiteboard.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const STYLE = 'b12d551b-3c18-47a3-ae33-f5fd7ea4eb48'      // Flat Panel 16mm
const TPL_DSM = '7917b996-9833-42a7-8910-a2b3f1c02c81'    // PT Colour Matt 16 Classic White Matt (colour range row)
const TPL_MAT = 'fcfa8ede-490a-4dfc-bee9-42923d1e9c0f'    // PT Colour Matt 16mm – Classic White Matt
const TPL_33 = '9228296e-6867-4263-bf9c-0c0d3a1713f4'     // PT Colour Matt 33mm – Classic White Matt
const WB = 'd081b2a1-38a8-472c-a415-f179699a1347'         // Whiteboard 16.5
const HS = 'ee5348f8-7415-498b-b4cf-4bd8f6b4e3f8'         // CabinetWare Square 128

async function childMat(tplId, colour, patch) {
  const tpl = chk('tpl mat', await sb.from('materials').select('*').eq('id', tplId).single())
  const base = tpl.name.split(' – ')[0]
  const name = `${base} – ${colour}`
  const have = chk('find mat', await sb.from('materials').select('id,name').eq('name', name).maybeSingle())
  if (have) return have
  const { id, created_at, updated_at, ...rest } = tpl
  return chk('ins mat', await sb.from('materials').insert({ ...rest, name, colour_name: colour, overridden: [], is_default_colour: false, ...patch }).select('id,name').single())
}
const dw = await childMat(TPL_MAT, 'Designer White Matt', { face_colour: '#f4f4f1', back_colour: '#f4f4f1', edge_colour: '#ecece8' })
const top = await childMat(TPL_33, 'Bottochino Classic Matt', { face_colour: '#cfc6b8', back_colour: '#cfc6b8', edge_colour: '#c4baab', sheet_dx: 3600, notes: '3600 x 1200 x 33 sheet (RHK6603 benchtop + floating shelf)' })

const tdsm = chk('tpl dsm', await sb.from('door_schedule_materials').select('*').eq('id', TPL_DSM).single())
let dsm = chk('find dsm', await sb.from('door_schedule_materials').select('id,material_id').eq('schedule_id', tdsm.schedule_id).eq('colour_name', 'Designer White Matt').maybeSingle())
if (!dsm) {
  const { id, created_at, updated_at, ...rest } = tdsm
  dsm = chk('ins dsm', await sb.from('door_schedule_materials').insert({ ...rest, colour_name: 'Designer White Matt', colour_code: 'PT16_DESIGNER_WHITE_MATT', material_id: dw.id, is_default: false, sort_order: 45 }).select('id,material_id').single())
}

let p = chk('findp', await sb.from('projects').select('id,name').eq('job_number', 'RHK6603').maybeSingle())
if (!p) {
  const tpl = chk('tpl', await sb.from('projects').select('*').eq('job_number', 'RHK6351').single())
  const { id, created_at, updated_at, name, job_number, client_name, client_address, client_id, notes, nest_run_seq, deleted_at, ...d } = tpl
  p = chk('proj', await sb.from('projects').insert({ ...d, name: 'RHK6603 - CKC - WIR - 1/38 Westaway Pde Currimundi', job_number: 'RHK6603',
    client_name: 'Caloundra Kitchens (Brigid & Kevin)', client_address: '1/38 Westaway Parade, Currimundi QLD',
    notes: 'Caloundra Kitchens WIR (Liam G, 10/11/2026). Fronts 16 PT Designer White Matt, internals Whiteboard, 33 Bottochino top + floating shelf, 6 sliders on a double track.',
    rule_overrides: { ...(d.rule_overrides ?? {}), TOEH: 100 }, handle_schedule_id: HS,
    default_door_style_id: STYLE, base_door_style_id: STYLE, wall_door_style_id: STYLE, tall_door_style_id: STYLE,
    base_door_colour_id: dsm.id, wall_door_colour_id: dsm.id, tall_door_colour_id: dsm.id }).select('id,name').single())
  const jm = chk('jm', await sb.from('job_materials').select('*').eq('project_id', tpl.id))
  const rows = jm.filter(r => !['exposed', 'door_face'].includes(r.material_role)).map(({ id, created_at, updated_at, ...r }) => ({ ...r, project_id: p.id }))
  for (const c of ['base', 'wall', 'tall']) rows.push({ project_id: p.id, assembly_class: c, material_role: 'exposed', material_id: dw.id })
  chk('jm ins', await sb.from('job_materials').insert(rows))
  chk('toekick', await sb.from('job_toekick_materials').insert({ project_id: p.id, part_role: 'face', material_id: WB }))
  console.log('job_materials', rows.map(r => r.assembly_class + ':' + r.material_role + ':' + r.material_id.slice(0, 8)).join(' '))
}
console.log(JSON.stringify({ project: p, designerWhite: dw, colour: dsm, top }))
process.exit(0)
