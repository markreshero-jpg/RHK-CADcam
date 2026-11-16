// RHK6468 Wall Panelling: building walls behind the panelling, from Mark's CAD markup 2026-11-16 ("wall here").
// Nib walls (centred rectangles, not part of the room outline). Lounge wall 111 (Mark's ruled rectangle
// x -3474..-3363), media wall behind the 3400 entry panels (slider end x -6530 to the lounge wall), north return
// at the far end of the lounge wall (x -3474..-3015, sketched ~110). Entry wall thickness sketched freehand - 110 TBC.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '00e46b73-13de-4df3-9235-871505d4ee81'
const have = (await sb.from('walls').select('name').eq('room_id', R)).data.map(w => w.name)
if (have.length !== 3) throw new Error('expected 3 walls, have ' + have)
const defs = [
  { name: 'Wall 4', x: -3418.5, y: 2000, angle: 270, length: 4910, t: 111, h: 2706 },  // lounge / media wall
  { name: 'Wall 5', x: -6530, y: 1945, angle: 0, length: 3056, t: 110, h: 2704 },      // media wall behind entry 3400
  { name: 'Wall 6', x: -3474, y: -2965, angle: 0, length: 459, t: 110, h: 2706 },      // north return
]
for (const [i, w] of defs.entries()) {
  const { data, error } = await sb.from('walls').insert({ room_id: R, name: w.name, sort_order: 3 + i, length: w.length, angle: w.angle,
    pos_x: w.x, pos_y: w.y, thickness: w.t, height: w.h, wall_type: 'nib' }).select('id').single()
  if (error) throw error
  console.log(w.name, data.id)
}
