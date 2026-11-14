// RHK6468 Walk In Robe set-up (Mark 2026-11-15): walls from the marked-up 7.07 plan, CH 2693,
// top line 2663 + 30 BH, room colour 16 PT Classic White Matt (as the Laundry, "for now").
// Origin = north wall west corner (inside faces). Gyprock 12 (as the kitchen).
//   north 5638 - 2x12 = 5614 | east 2202 (as marked) | south 3869 - 12 = 3857 off the east wall
//   west nib 613 - 12 = 601 | mirror-wall return 518 | mirror wall 5614 - 3857 = 1757 (to the north run's inside face line)
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ok = r => { if (r.error) throw r.error; return r.data }
const ROOM = 'dfa682a3-020b-4704-8661-3dbbd6cdf224'
const CH = 2693
const STYLE = 'b12d551b-3c18-47a3-ae33-f5fd7ea4eb48', COLOUR = '7917b996-9833-42a7-8910-a2b3f1c02c81', MAT = 'fcfa8ede-490a-4dfc-bee9-42923d1e9c0f'
const have = ok(await sb.from('walls').select('id').eq('room_id', ROOM))
if (have.length) throw new Error('room already has walls')
const W = [
  { x: 0, y: 601, length: 601, angle: 270 },        // 1 west nib (bench seat end)
  { x: 0, y: 0, length: 5614, angle: 0 },           // 2 north = Elev 1
  { x: 5614, y: 0, length: 2202, angle: 90 },       // 3 east = Elev 2
  { x: 5614, y: 2202, length: 3857, angle: 180 },   // 4 south = Elev 3
  { x: 1757, y: 2202, length: 518, angle: 270 },    // 5 return beside the south shoes
  { x: 1757, y: 1684, length: 1757, angle: 180 },   // 6 mirror wall (Elev 3 right)
]
for (const [i, w] of W.entries()) ok(await sb.from('walls').insert({ room_id: ROOM, name: `Wall ${i + 1}`, sort_order: i, length: w.length, angle: w.angle, pos_x: w.x, pos_y: w.y, thickness: 90, height: CH, wall_type: 'standard' }))
ok(await sb.from('rooms').update({ wall_cabinet_top: CH - 30, room_dy: CH, door_style_override_id: STYLE,
  base_door_style_id: STYLE, wall_door_style_id: STYLE, tall_door_style_id: STYLE,
  base_door_colour_id: COLOUR, wall_door_colour_id: COLOUR, tall_door_colour_id: COLOUR }).eq('id', ROOM))
ok(await sb.from('room_materials').delete().eq('room_id', ROOM))
ok(await sb.from('room_materials').insert(['base', 'wall', 'tall'].map(c => ({ room_id: ROOM, assembly_class: c, material_role: 'exposed', material_id: MAT }))))
console.log('walls + room set')
