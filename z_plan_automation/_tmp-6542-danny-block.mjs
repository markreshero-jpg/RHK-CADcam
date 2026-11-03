// RHK6542 Danny's Robe: move the spec block + SITE NOTES clear of the plan dim rows past the right wall.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a'
const room = (await sb.from('rooms').select('annotation_scale').eq('id', R).single()).data
const S = room?.annotation_scale ?? 20
const walls = (await sb.from('walls').select('*').eq('room_id', R)).data
let maxX = -Infinity
for (const w of walls) {
  const a = w.angle * Math.PI / 180, ex = w.pos_x + w.length * Math.cos(a)
  maxX = Math.max(maxX, w.pos_x, ex) ; maxX = Math.max(maxX, Math.max(w.pos_x, ex) + (w.thickness ?? 90))
}
// Dim rows run to ~16 paper mm past the outer face (+ text); start the block 30 paper mm out.
const X = Math.ceil((maxX + 30 * S) / 50) * 50
console.log('scale', S, 'outer x', maxX, '-> block x', X)
const anns = (await sb.from('room_annotations').select('id,geom,text').eq('room_id', R).eq('view', 'plan')).data
for (const a of anns) {
  const g = { ...a.geom, at: { ...a.geom.at, x: X } }
  const { error } = await sb.from('room_annotations').update({ geom: g }).eq('id', a.id)
  console.log(a.text.split('\n')[0], a.geom.at, '->', g.at, error?.message ?? 'ok')
}
