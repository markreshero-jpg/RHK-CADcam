// RHK6478 DS TV Unit pre-draw: square placement walls (the TV wall is angled 7.89 deg in post), room finishes in
// LX Abs Grain 18 Sublime Teak, sharknose, 100 kick, overhead line 2690 (2720 ceiling - 30 BH).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = '46c02367-c556-489e-9907-67785eb2cd87'
const ABS = '28d45d84-3270-40ad-ae78-7df696bcc388', TEAK_ROW = 'bd47d2f0-973a-492c-a383-d50dc2b599c7', TEAK18 = 'd67d85b0-b12b-4b03-be3c-8bdbbf23cd11'
const SHARK = '243a2e18-5966-409f-8fec-f056006d5a61'

chk('cabs del', await sb.from('cabinet_instances').delete().eq('room_id', R))
chk('walls del', await sb.from('walls').delete().eq('room_id', R))
const walls = [
  { name: 'Wall 1', x: 0, y: 745, length: 745, angle: 270 },
  // Square placement line 3701 (= 3736 along the 7.89 deg wall); angled in post.
  { name: 'Wall 2', x: 0, y: 0, length: 3701, angle: 0 },
  { name: 'Wall 3', x: 3701, y: 0, length: 1134, angle: 90 },
]
chk('walls', await sb.from('walls').insert(walls.map((w, i) => ({ room_id: R, name: w.name, sort_order: i, length: w.length, angle: w.angle,
  pos_x: w.x, pos_y: w.y, thickness: 90, height: 2720, wall_type: 'standard' }))))
chk('room', await sb.from('rooms').update({ room_dy: 2720, wall_cabinet_top: 2690, rule_overrides: { TOEH: 100 },
  base_door_style_id: ABS, base_door_colour_id: TEAK_ROW, tall_door_style_id: ABS, tall_door_colour_id: TEAK_ROW,
  wall_door_style_id: ABS, wall_door_colour_id: TEAK_ROW, handle_schedule_id: SHARK }).eq('id', R))
chk('rm del', await sb.from('room_materials').delete().eq('room_id', R))
chk('rm', await sb.from('room_materials').insert(['base', 'tall', 'wall'].map(c => ({ room_id: R, assembly_class: c, material_role: 'exposed', material_id: TEAK18 }))))
chk('tk del', await sb.from('room_toekick_materials').delete().eq('room_id', R))
chk('tk', await sb.from('room_toekick_materials').insert({ room_id: R, part_role: 'face', material_id: TEAK18 }))
console.log('pre done')
