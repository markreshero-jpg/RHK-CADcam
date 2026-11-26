// RHK6548 Costello - Hard Coffee (Mark 2026-11-26): job set-up + walls for the 4 rooms.
// Drawn off Nathan Costello's email 26/11 2:45pm "Hard coffee joinery" (+ JMF plans p07/p08).
// JF01 Polytec Blonde Oak Woodmatt 18 (Flat Panel 18mm Polytec). Schedules copied from RHK6563 (same builder).
// Kick 100 (100 coving to the food service area). Back Kitchen room = Whiteboard 16.5 (new colour row on Flat Panel 16mm).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const P = '31ed4cce-ffd3-4004-b8f1-d62f8dad6f5c'
const SRC = '416bf6cf-9681-4462-b93d-6ecac19e015b' // RHK6563 Costello
const STYLE = '2638716d-7be9-474a-9242-b7d999a7d62e' // Flat Panel 18mm Polytec
const COLOUR = '1cda84a7-fa61-45c0-96bc-00e3d4b24860' // Blonde Oak Woodmatt range row
const BOARD = 'b7b521b4-9d7b-4631-995c-417ae940b86e' // PT Woodmatt 18mm - Blonde Oak Woodmatt
const WB = 'd081b2a1-38a8-472c-a415-f179699a1347' // Whiteboard 16.5mm
const WB_STYLE = 'b12d551b-3c18-47a3-ae33-f5fd7ea4eb48' // Flat Panel 16mm
const WB_SCHED = '654b33ce-46e5-4a61-948c-d29bc26d2f7c'
const WHITE_EB = '1c303ce8-a80b-4fb3-be85-2756b8fe7d34' // edge band on Classic White Matt
const ROOMS = {
  ws: '2bed2187-0b9c-4cf3-9e3e-5d29be5538a0', // Water Station
  fc: '09786d9b-378e-42ed-9fc7-1aed4c7b21ab', // Front Counter
  bc: 'd3c04ade-ba07-4462-a40c-2a4bd1952d31', // Back Counter
  bk: 'e8b3c950-5be5-4e4a-9117-451395e9d2a1', // Back Kitchen
}

// 1. Job defaults
const src = chk('src', await sb.from('projects').select('*').eq('id', SRC).single())
const cur = chk('cur', await sb.from('projects').select('notes').eq('id', P).single())
const copy = ['drawerbox_schedule_id', 'inner_drawerbox_schedule_id', 'hinge_schedule_id', 'slide_schedule_id', 'construction_schedule_id', 'drawer_box_method_id', 'inner_drawer_box_method_id', 'handle_schedule_id', 'toekick_schedule_id', 'assembly_schedule_id', 'front_schedule_id']
const patch = Object.fromEntries(copy.map(k => [k, src[k]]))
Object.assign(patch, {
  default_door_style_id: STYLE, base_door_style_id: STYLE, wall_door_style_id: STYLE, tall_door_style_id: STYLE,
  base_door_colour_id: COLOUR, wall_door_colour_id: COLOUR, tall_door_colour_id: COLOUR,
  rule_overrides: { RD: 80, TOEH: 100 },
  class_dimension_defaults: { base: { dy: 755, dz: 545 }, tall: { dy: 2320, dz: 490 } },
})
const note = 'SET UP 26/11/2026 off Nathan Costello email 26/11 2:45pm "Hard coffee joinery": JF01 Polytec Blonde Oak Woodmatt; kick 100; stainless tops by others. JF02 Laminex brass kickboard price asked (email 3:57pm) - not in library.'
if (!(cur.notes ?? '').includes('Hard coffee joinery')) patch.notes = ((cur.notes ?? '') + '\n\n' + note).trim()
chk('project', await sb.from('projects').update(patch).eq('id', P))

for (const cls of ['base', 'wall', 'tall']) for (const role of ['exposed', 'door_face']) {
  const have = chk('jm', await sb.from('job_materials').select('id').eq('project_id', P).eq('assembly_class', cls).eq('material_role', role))
  if (!have.length) chk('jm ins', await sb.from('job_materials').insert({ project_id: P, assembly_class: cls, material_role: role, material_id: BOARD }))
}
const tk = chk('tk', await sb.from('job_toekick_materials').select('id').eq('project_id', P).eq('part_role', 'face'))
if (!tk.length) chk('tk ins', await sb.from('job_toekick_materials').insert({ project_id: P, part_role: 'face', material_id: BOARD }))

// 2. Whiteboard colour on the Flat Panel 16mm range (16.5 whiteboard board)
let wbRow = chk('wbq', await sb.from('door_schedule_materials').select('id').eq('schedule_id', WB_SCHED).eq('material_id', WB)).at(0)
if (!wbRow) wbRow = chk('wb ins', await sb.from('door_schedule_materials').insert({ schedule_id: WB_SCHED, colour_name: 'Whiteboard', brand: 'Generic', finish: 'Satin', material_id: WB, edgeband_id: WHITE_EB, is_default: false, is_active: true, sort_order: 90 }).select('id').single())
console.log('whiteboard colour row', wbRow.id)

// 3. Back Kitchen room = whiteboard
chk('bk room', await sb.from('rooms').update({
  door_style_override_id: WB_STYLE, base_door_style_id: WB_STYLE, wall_door_style_id: WB_STYLE, tall_door_style_id: WB_STYLE,
  base_door_colour_id: wbRow.id, wall_door_colour_id: wbRow.id, tall_door_colour_id: wbRow.id,
}).eq('id', ROOMS.bk))
for (const cls of ['base', 'wall', 'tall']) for (const role of ['exposed', 'door_face']) {
  const have = chk('rm', await sb.from('room_materials').select('id').eq('room_id', ROOMS.bk).eq('assembly_class', cls).eq('material_role', role))
  if (!have.length) chk('rm ins', await sb.from('room_materials').insert({ room_id: ROOMS.bk, assembly_class: cls, material_role: role, material_id: WB }))
}
const rtk = chk('rtk', await sb.from('room_toekick_materials').select('id').eq('room_id', ROOMS.bk).eq('part_role', 'face'))
if (!rtk.length) chk('rtk ins', await sb.from('room_toekick_materials').insert({ room_id: ROOMS.bk, part_role: 'face', material_id: WB }))

// 4. Walls (clockwise). Counter area CH 2705, kitchen 2420.
const WALLS = {
  ws: { h: 2705, w: [{ x: 0, y: 590, length: 590, angle: 270 }, { x: 0, y: 0, length: 590, angle: 0 }] },
  fc: { h: 2705, w: [{ x: 0, y: 545, length: 545, angle: 270 }, { x: 0, y: 0, length: 3440, angle: 0 }] },
  bc: { h: 2705, w: [{ x: 0, y: 0, length: 600, angle: 0 }, { x: 600, y: 0, length: 545, angle: 90 }] },
  bk: { h: 2420, w: [{ x: 0, y: 490, length: 490, angle: 270 }, { x: 0, y: 0, length: 665, angle: 0 }] },
}
for (const [k, { h, w }] of Object.entries(WALLS)) {
  const R = ROOMS[k]
  chk('room h', await sb.from('rooms').update({ room_dy: h }).eq('id', R))
  const have = chk('walls', await sb.from('walls').select('id').eq('room_id', R))
  if (!have.length) chk('walls ins', await sb.from('walls').insert(w.map((x, i) => ({ room_id: R, name: `Wall ${i + 1}`, sort_order: i, length: x.length, angle: x.angle, pos_x: x.x, pos_y: x.y, thickness: 90, height: h, wall_type: 'standard' }))))
  console.log(k, 'walls', have.length ? 'kept' : 'inserted')
}
console.log('done')
process.exit(0)
