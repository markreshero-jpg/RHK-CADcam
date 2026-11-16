// RHK6468 Wall Panelling walls rev (Mark's CAD markup 2026-11-16 10:47-10:49): "no wall here" X over Wall 4 behind
// both lounge nibs -> Wall 4 only between the nibs' gables (y 1433 .. -2343). Nibs = hollow framed boxes: 90 strip
// behind the 33 gable (recess side) + 90 strip behind the front panel; corner nib closes on the entry wall (Wall 5
// now runs on to the corner, x -3130), far nib closes on the north return (Wall 6). 90 framing assumed (freehand).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '00e46b73-13de-4df3-9235-871505d4ee81'
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const walls = chk('w', await sb.from('walls').select('id,name').eq('room_id', R))
const id = n => walls.find(w => w.name === n).id
if (walls.length !== 6) throw new Error('expected 6 walls')
chk('w4', await sb.from('walls').update({ pos_y: 1433, length: 3776 }).eq('id', id('Wall 4')))
chk('w5', await sb.from('walls').update({ length: 3400 }).eq('id', id('Wall 5')))
const add = [
  { name: 'Wall 7', x: -3474, y: 1478, angle: 0, length: 344, t: 90, h: 2386 },     // corner nib, behind the gable
  { name: 'Wall 8', x: -3175, y: 1890, angle: 270, length: 367, t: 90, h: 2386 },   // corner nib, behind the front panel
  { name: 'Wall 9', x: -3474, y: -2388, angle: 0, length: 344, t: 90, h: 2386 },    // far nib, behind the gable
  { name: 'Wall 10', x: -3175, y: -2433, angle: 270, length: 477, t: 90, h: 2386 }, // far nib, behind the front panel
]
for (const [i, w] of add.entries()) chk('ins', await sb.from('walls').insert({ room_id: R, name: w.name, sort_order: 6 + i, length: w.length, angle: w.angle,
  pos_x: w.x, pos_y: w.y, thickness: w.t, height: w.h, wall_type: 'nib' }))
console.log('ok')
