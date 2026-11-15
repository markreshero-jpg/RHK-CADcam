// RHK6478 DS Powder (Darby 2026-11-11): basin centre 600 -> 650 off the right wall (fixture + link to BC-03, 600 dim, 140 dim, note).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) { console.log('ERR', t, r.error.message); process.exit(1) } return r.data }
const R = 'e2a2d342-8475-4967-b1be-8387919acd1c'
const fx = chk('fx', await sb.from('room_fixtures').select('id,x,link_x').eq('room_id', R).eq('category', 'sink').single())
if (fx.link_x !== 575.5) { console.log('already moved', fx); process.exit(0) }
chk('fx', await sb.from('room_fixtures').update({ x: fx.x - 50, link_x: 525.5 }).eq('id', fx.id))
const anns = chk('ann', await sb.from('room_annotations').select('id,kind,text,geom').eq('room_id', R).eq('view', 'elevation'))
for (const a of anns) {
  let v = null
  if (a.kind === 'dim' && a.geom.p1.x === 1751 && a.geom.p2.x === 2351) v = { geom: { ...a.geom, p1: { ...a.geom.p1, x: 1701 } } }
  else if (a.kind === 'dim' && a.geom.p1.x === 1551 && a.geom.p2.x === 1551) v = { geom: { ...a.geom, p1: { ...a.geom.p1, x: 1501 }, p2: { ...a.geom.p2, x: 1501 } } }
  else if (a.kind === 'text' && /^BASIN \+ SPOUT centred 600/.test(a.text)) v = { text: a.text.replace('centred 600 from', 'centred 650 from'), geom: { ...a.geom, leader: [{ ...a.geom.leader[0], x: 1701 }, a.geom.leader[1]] } }
  if (v) { chk('ann', await sb.from('room_annotations').update(v).eq('id', a.id)); console.log('ann', a.kind, (a.text ?? '').slice(0, 30)) }
}
console.log('basin x', fx.x - 50, 'link_x 525.5 (centre 1701 = 650 off the right wall)')
process.exit(0)
