// RHK6592 Kitchen: rotate the whole room 90° left (CCW on screen, y down): (x,y) -> (y, W - x), angle -> angle - 90.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'dc7a22f3-ed0b-4771-a42e-4548fc4de1e1', W = 3925
const r3 = v => Math.round(v * 1000) / 1000
const P = (x, y) => [r3(y), r3(W - x)]
const A = a => (((a ?? 0) - 90) % 360 + 360) % 360
const chk = (what, r) => { if (r.error) { console.error(what, r.error.message); process.exit(1) } }
for (const w of (await sb.from('walls').select('id,name,pos_x,pos_y,angle').eq('room_id', R)).data) {
  const [x, y] = P(w.pos_x, w.pos_y); chk(w.name, await sb.from('walls').update({ pos_x: x, pos_y: y, angle: A(w.angle) }).eq('id', w.id)); console.log(w.name, x, y, A(w.angle))
}
const cabs = (await sb.from('cabinet_instances').select('id,label,pos_x,pos_y,rotation,label_offsets').eq('room_id', R)).data
for (const c of cabs) {
  if (c.label_offsets && Object.keys(c.label_offsets).length) console.log('NOTE label_offsets', c.label, JSON.stringify(c.label_offsets))
  const [x, y] = P(c.pos_x, c.pos_y); chk(c.label, await sb.from('cabinet_instances').update({ pos_x: x, pos_y: y, rotation: A(c.rotation) }).eq('id', c.id))
}
console.log('cabinets', cabs.length)
for (const f of (await sb.from('room_fixtures').select('id,name,x,y,rotation').eq('room_id', R)).data) {
  const [x, y] = P(f.x, f.y); chk(f.name, await sb.from('room_fixtures').update({ x, y, rotation: A(f.rotation) }).eq('id', f.id)); console.log(f.name, x, y, A(f.rotation))
}
// Spec block: keep it to the right of the (now 5420 wide) room
const ann = (await sb.from('room_annotations').select('id,geom').eq('room_id', R).eq('view', 'plan')).data
for (const a of ann) chk('ann', await sb.from('room_annotations').update({ geom: { ...a.geom, at: { x: 5800, y: 0 } } }).eq('id', a.id))
console.log('annotations', ann.length)
