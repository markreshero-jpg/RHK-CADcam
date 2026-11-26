// RHK6614 The Hive Co - 189 Payne Rd (Mark 2026-11-26): job setup + Upstairs Living Storage walls.
// Job defaults copied from RHK6581 (Hive, Laminex 18mm ABS Grain Elegant Oak); handles Sharknose Finger Pull; kick 120.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const P = 'b552f872-a0ad-4954-8e43-a5c4f4e0f301'
const SRC = '781bb736-79a1-4ee1-8061-b026f77ada54' // RHK6581 live
const R = '65c69db5-2aba-49e0-81c8-95c559968aa2'
const STYLE = '28d45d84-3270-40ad-ae78-7df696bcc388' // Laminex 18mm ABS Grain
const COLOUR = 'c5a5e82f-216b-4962-aa98-0ed6f10605e8' // Elegant Oak range row
const BOARD = '4af1a361-2403-4b0f-a429-46130d5810e5' // LX Abs Grain 18mm - Elegant Oak
const SHARKNOSE = '243a2e18-5966-409f-8fec-f056006d5a61'

const src = chk('src', await sb.from('projects').select('*').eq('id', SRC).single())
const cur = chk('cur', await sb.from('projects').select('notes').eq('id', P).single())
const copy = ['drawerbox_schedule_id', 'inner_drawerbox_schedule_id', 'hinge_schedule_id', 'slide_schedule_id', 'construction_schedule_id', 'drawer_box_method_id', 'inner_drawer_box_method_id']
const patch = Object.fromEntries(copy.map(k => [k, src[k]]))
Object.assign(patch, {
  handle_schedule_id: SHARKNOSE,
  default_door_style_id: STYLE, base_door_style_id: STYLE, wall_door_style_id: STYLE, tall_door_style_id: STYLE,
  base_door_colour_id: COLOUR, wall_door_colour_id: COLOUR, tall_door_colour_id: COLOUR,
  rule_overrides: { RD: 80, TOEH: 120 },
  class_dimension_defaults: { base: { dy: 855, dz: 575 }, wall: { dz: 400 } },
})
if (!cur.notes.includes('Elegant Oak')) patch.notes = cur.notes + '\n\nCHANGED 26/11/2026 (Mark): doors + panels now 18mm Elegant Oak ABS Grain (Laminex), not NavUrban Bellevue Oak. Ceiling 2655. Upper = 984 open box with 18 WF (straight) shadowline fillers either side down to the bench; base B2D 984 with BFK 18 either side; 20 stone wall to wall, 600 deep. Vent holes TBC.'
chk('project', await sb.from('projects').update(patch).eq('id', P))

for (const cls of ['base', 'wall', 'tall']) for (const role of ['exposed', 'door_face']) {
  const have = chk('jm', await sb.from('job_materials').select('id').eq('project_id', P).eq('assembly_class', cls).eq('material_role', role))
  if (!have.length) chk('jm ins', await sb.from('job_materials').insert({ project_id: P, assembly_class: cls, material_role: role, material_id: BOARD }))
}
const tk = chk('tk', await sb.from('job_toekick_materials').select('id').eq('project_id', P).eq('part_role', 'face'))
if (!tk.length) chk('tk ins', await sb.from('job_toekick_materials').insert({ project_id: P, part_role: 'face', material_id: BOARD }))

// Room: CH 2655, overhead top line 2625 (cupboard to ceiling -> drop 30 + 30 BH).
chk('room', await sb.from('rooms').update({ room_dy: 2655, wall_cabinet_top: 2625 }).eq('id', R))
const walls = chk('walls', await sb.from('walls').select('id').eq('room_id', R))
if (!walls.length) {
  const W = [
    { x: 0, y: 600, length: 600, angle: 270 },   // 1 left return, front -> back
    { x: 0, y: 0, length: 1020, angle: 0 },      // 2 back wall
    { x: 1020, y: 0, length: 600, angle: 90 },   // 3 right return, back -> front
  ]
  chk('walls ins', await sb.from('walls').insert(W.map((w, i) => ({ room_id: R, name: `Wall ${i + 1}`, sort_order: i, length: w.length, angle: w.angle, pos_x: w.x, pos_y: w.y, thickness: 90, height: 2655, wall_type: 'standard' }))))
}
console.log('done', Object.keys(patch).join(','))
process.exit(0)
