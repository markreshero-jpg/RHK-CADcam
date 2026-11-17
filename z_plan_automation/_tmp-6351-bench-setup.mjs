// RHK6351 Bench Seat (Mark 2026-11-18, site measure 2026-11-17): alcove 2295 wall to wall, side walls 687 / 690,
// kick 120. Closed box (panel front), 450 H incl kick x 680 deep overall, 16mm PT Woodmatt "Tasmanian Oak".
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const strip = m => { const { id, created_at, updated_at, ...rest } = m; return rest }
const P = '617e2130-d7e4-4e3a-95ef-c7e738eb3b8e'
const PRIME16 = '28a7be0d-479f-4ca0-8f92-e4b6c6093d51', PRIME_DC = 'fe78ff94-f9f2-41be-b999-5a5fb8e7b35f'
const STYLE = '2ea46332-a1e7-48a0-855a-7f98675ec160', SCHED = '9c04b651-e76f-4822-a2dd-e716d3e6bfac'
const NAME = 'PT Woodmatt 16mm – Tasmanian Oak Woodmatt'
let b = chk('b', await sb.from('materials').select('id').eq('name', NAME)).at(0)
if (!b) b = chk('bi', await sb.from('materials').insert({ ...strip(chk('tpl', await sb.from('materials').select('*').eq('id', PRIME16).single())),
  name: NAME, colour_name: 'Tasmanian Oak Woodmatt', face_colour: '#d2b48a', edge_colour: '#d2b48a', is_default_colour: false }).select('id').single())
let dc = chk('dc', await sb.from('door_schedule_materials').select('id').eq('schedule_id', SCHED).eq('colour_name', 'Tasmanian Oak Woodmatt')).at(0)
if (!dc) dc = chk('dci', await sb.from('door_schedule_materials').insert({ ...strip(chk('dt', await sb.from('door_schedule_materials').select('*').eq('id', PRIME_DC).single())),
  colour_name: 'Tasmanian Oak Woodmatt', colour_code: 'Tasmanian Oak', material_id: b.id, is_default: false, sort_order: 12 }).select('id').single())
let r = chk('r', await sb.from('rooms').select('id').eq('project_id', P).eq('name', 'Bench Seat').is('deleted_at', null)).at(0)
if (!r) {
  const sib = chk('sib', await sb.from('rooms').select('sort_order').eq('project_id', P))
  r = chk('ri', await sb.from('rooms').insert({ project_id: P, name: 'Bench Seat', sort_order: sib.reduce((m, x) => Math.max(m, x.sort_order + 1), 0), room_dy: 2400,
    rule_overrides: { TOEH: 120 },
    door_style_override_id: STYLE, base_door_style_id: STYLE, wall_door_style_id: STYLE, tall_door_style_id: STYLE,
    base_door_colour_id: dc.id, wall_door_colour_id: dc.id, tall_door_colour_id: dc.id }).select('id').single())
  for (const cls of ['base', 'wall', 'tall']) chk('rm', await sb.from('room_materials').insert({ room_id: r.id, assembly_class: cls, material_role: 'exposed', material_id: b.id }))
  const walls = [
    { length: 687, angle: 270, pos_x: 0, pos_y: 687 },
    { length: 2295, angle: 0, pos_x: 0, pos_y: 0 },
    { length: 690, angle: 90, pos_x: 2295, pos_y: 0 },
  ]
  for (const [i, w] of walls.entries()) chk('w', await sb.from('walls').insert({ room_id: r.id, name: `Wall ${i + 1}`, sort_order: i, ...w, thickness: 90, height: 2400, wall_type: 'standard' }))
}
console.log(JSON.stringify({ board: b.id, colour: dc.id, room: r.id }))
