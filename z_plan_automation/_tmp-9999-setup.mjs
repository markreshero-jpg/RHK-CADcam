// RHK9999 Mark Henshall BBQ Cabinet: new CPP White board + project cloned from RHK6593 (Stylelex outdoor).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (l, r) => { if (r.error) { console.log(l, 'ERROR', r.error.message); process.exit(1) } return r.data }
const TPL = '047aff64-b151-4cb0-b074-6007eaf03261', WB = 'd081b2a1-38a8-472c-a415-f179699a1347'
// Board
let cpp = (await sb.from('materials').select('id').eq('name', 'CPP White 16mm').maybeSingle()).data
if (!cpp) {
  const wb = chk('wb', await sb.from('materials').select('*').eq('id', WB).single())
  const { id, created_at, updated_at, ...rest } = wb
  cpp = chk('cpp', await sb.from('materials').insert({ ...rest, name: 'CPP White 16mm', brand: 'CPP', notes: 'Water resistant board (outdoor carcasses). Cloned from Whiteboard 16.5mm, check sheet size + edgeband.' }).select('id').single())
}
// Project
const NAME = 'RHK9999 Mark Henshall - BBQ Cabinet'
let proj = (await sb.from('projects').select('id').eq('name', NAME).maybeSingle()).data
if (!proj) {
  const tpl = chk('tpl', await sb.from('projects').select('*').eq('id', TPL).single())
  const { id, created_at, updated_at, name, job_number, client_name, client_address, client_id, notes, nest_run_seq, ...defaults } = tpl
  proj = chk('proj', await sb.from('projects').insert({
    ...defaults, name: NAME, job_number: 'RHK9999', client_name: 'Mark Henshall',
    client_address: '23 Arkana Drive',
    notes: 'Outdoor BBQ area. 20 stone top with 100 apron, 900 high. Fronts Stylelex 18mm (as RHK6593). Carcass 16mm CPP White (water resistant). 100 stone panels between cupboards (by stonemason).',
    class_dimension_defaults: { ...tpl.class_dimension_defaults, base: { dy: 880, dz: 630 } },
  }).select('id').single())
  const jm = chk('jm', await sb.from('job_materials').select('*').eq('project_id', TPL))
  const rows = jm.map(({ id, ...m }) => ({ ...m, project_id: proj.id }))
  for (const cls of ['base', 'wall', 'tall']) for (const role of ['interior', 'shelf'])
    rows.push({ project_id: proj.id, assembly_class: cls, material_role: role, material_id: cpp.id })
  chk('job_materials', await sb.from('job_materials').insert(rows).select('id'))
  const tk = chk('tk', await sb.from('job_toekick_materials').select('*').eq('project_id', TPL))
  chk('tk ins', await sb.from('job_toekick_materials').insert([...tk.map(({ id, ...m }) => ({ ...m, project_id: proj.id })), { project_id: proj.id, part_role: 'interior', material_id: cpp.id }]).select('id'))
}
console.log(JSON.stringify({ project: proj.id, cpp: cpp.id }))
