// RHK6468 Wall Panelling walls rev 2 (Mark's markup 2026-11-16 10:55-10:58): "make a 4550 solid wall here" = garage
// wall behind the 4550 entry panels (his rect x -13300..-8750, y 1901..2000 = 99); "wall here" = garage / media wall
// north off the slider's left jamb (his rect x -8871..-8750, y 631..2000 = 121 x 1369). Garage door: inward opening
// (into the garage), hinged on the nib (slider) side - noted on TC-01.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '00e46b73-13de-4df3-9235-871505d4ee81'
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const walls = chk('w', await sb.from('walls').select('name').eq('room_id', R))
if (walls.length !== 10) throw new Error('expected 10 walls, have ' + walls.length)
const add = [
  { name: 'Wall 11', x: -13300, y: 1950.5, angle: 0, length: 4550, t: 99, h: 2704 },      // garage wall
  { name: 'Wall 12', x: -8810.75, y: 2000, angle: 270, length: 1369, t: 121.5, h: 2704 }, // garage / media wall
]
for (const [i, w] of add.entries()) chk('ins', await sb.from('walls').insert({ room_id: R, name: w.name, sort_order: 10 + i, length: w.length, angle: w.angle,
  pos_x: w.x, pos_y: w.y, thickness: w.t, height: w.h, wall_type: 'nib' }))
const c = chk('c', await sb.from('cabinet_instances').select('id,notes').eq('room_id', R).eq('label', 'TC-01').single())
if (!c.notes.includes('opens INTO the garage')) chk('n', await sb.from('cabinet_instances').update({ notes: c.notes.replace('hinges TBC', 'opens INTO the garage, hinged on the nib (slider) side (Mark 2026-11-16), hinges TBC') }).eq('id', c.id))
console.log('ok')
