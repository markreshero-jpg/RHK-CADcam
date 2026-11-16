// RHK6468 Wall Panelling: entry-end return wall (Mark's markup "300 wall", 300 long - Mark 2026-11-16).
// Runs 300 into the hall past the entry wall face (y 2000 -> 2300) from the back of the garage wall (y 1901), its
// east face on the start of the panels (x -13300). Thickness sketched freehand ~150-170 -> 150 TBC.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '00e46b73-13de-4df3-9235-871505d4ee81'
const n = (await sb.from('walls').select('id').eq('room_id', R)).data.length
if (n !== 12) throw new Error('expected 12 walls, have ' + n)
const { error } = await sb.from('walls').insert({ room_id: R, name: 'Wall 13', sort_order: 12, length: 399, angle: 90,
  pos_x: -13375, pos_y: 1901, thickness: 150, height: 2704, wall_type: 'nib' })
if (error) throw error
console.log('ok')
