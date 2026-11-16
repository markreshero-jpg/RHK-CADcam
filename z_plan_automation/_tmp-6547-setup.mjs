// RHK6547 Fez - Catalina - Georgie's Laundry: create the job (Mark 2026-11-16).
// 18 Laminex Abs Grain Elegant Oak fronts + exposed, 100 kick. Defaults cloned from RHK6351.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const STYLE = '28d45d84-3270-40ad-ae78-7df696bcc388' // Laminex 18mm ABS Grain
const COLOUR = 'c5a5e82f-216b-4962-aa98-0ed6f10605e8' // Elegant Oak
const MAT = '4af1a361-2403-4b0f-a429-46130d5810e5' // LX Abs Grain 18mm – Elegant Oak
const NAME = 'RHK6547 - Fez - 1/18 Catalina Dr Mudjimba'
let p = chk('findp', await sb.from('projects').select('id,name').eq('job_number', 'RHK6547').maybeSingle())
if (!p) {
  const tpl = chk('tpl', await sb.from('projects').select('*').eq('job_number', 'RHK6351').single())
  const { id, created_at, updated_at, name, job_number, client_name, client_address, client_id, notes, nest_run_seq, deleted_at, ...d } = tpl
  p = chk('proj', await sb.from('projects').insert({ ...d, name: NAME, job_number: 'RHK6547', client_name: 'Fez Constructions',
    client_address: '1/18 Catalina Drive, Mudjimba QLD', notes: "Georgie's laundry. Supply only.",
    rule_overrides: { ...(d.rule_overrides ?? {}), TOEH: 100 },
    default_door_style_id: STYLE, base_door_style_id: STYLE, wall_door_style_id: STYLE, tall_door_style_id: STYLE,
    base_door_colour_id: COLOUR, wall_door_colour_id: COLOUR, tall_door_colour_id: COLOUR }).select('id,name').single())
  const jm = chk('jm', await sb.from('job_materials').select('*').eq('project_id', tpl.id))
  const rows = jm.filter(r => r.material_role !== 'exposed').map(({ id, created_at, updated_at, ...r }) => ({ ...r, project_id: p.id }))
  for (const c of ['base', 'wall', 'tall']) rows.push({ project_id: p.id, assembly_class: c, material_role: 'exposed', material_id: MAT })
  chk('jm ins', await sb.from('job_materials').insert(rows))
  console.log('job_materials', rows.map(r => r.assembly_class + ':' + r.material_role).join(' '))
}
console.log(JSON.stringify(p))
process.exit(0)
