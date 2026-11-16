// RHK6468 Laundry rev 4 CAD: stack-space markup moves right 666.5, wine fridge space markup in its old place,
// benchtop cloud + tub leader follow the run, SITE NOTES updated. Our own rows only, edited in place.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const R = '874fed25-8e1b-4bbf-b1ff-3090361b5dad', X0 = -2510, Y0 = -795, D = 666.5
console.log(JSON.stringify(chk('tc', await sb.from('cabinet_instances').select('label,dx,dy,dz,pos_x').eq('room_id', R).in('label', ['TC-01', 'TC-02', 'WC-09']))))
const rows = chk('a', await sb.from('room_annotations').select('*').eq('room_id', R))
const by = p => rows.filter(r => r.id.startsWith(p))
const one = p => { const r = by(p); if (r.length !== 1) throw new Error('row ' + p); return r[0] }
const W2 = one('17631483').wall_id
if (!rows.some(r => (r.text ?? '').startsWith('WINE FRIDGE SPACE'))) {
  const mv = (r, g) => chk(r.id, sb.from('room_annotations').update({ geom: g }).eq('id', r.id))
  const e1 = one('17631483'), p1 = one('f42a5db0'), pt = one('94351c80'), et = one('d36a63c8')
  // copies for the wine space, then move the originals (stack) right
  const copy = (r, text) => { const { id, created_at, updated_at, ...rest } = r; return { ...rest, text, style: { ...(r.style ?? {}), src: 'markup-std' } } }
  chk('wine ins', await sb.from('room_annotations').insert([
    copy(e1, null), copy(p1, null),
    { ...copy(pt, 'WINE FRIDGE\nSPACE'), geom: { ...pt.geom, at: { x: pt.geom.at.x, y: pt.geom.at.y } } },
    { ...copy(et, 'WINE FRIDGE SPACE\n610W x 1900H\nVINTEC 595W x 610D x 1850H') },
  ]))
  await mv(e1, { a: { x: e1.geom.a.x + D - 30, y: e1.geom.a.y }, b: { x: e1.geom.b.x + D, y: e1.geom.b.y } })
  await mv(p1, { a: { x: p1.geom.a.x + D - 30, y: p1.geom.a.y }, b: { x: p1.geom.b.x + D, y: p1.geom.b.y } })
  await mv(pt, { ...pt.geom, at: { x: pt.geom.at.x + D, y: pt.geom.at.y } })
  await mv(et, { ...et.geom, at: { x: et.geom.at.x + D, y: et.geom.at.y } })
  // benchtop cloud starts at the new run; tub leader to the new tub centre (1333 + 379)
  const cl = one('c197ab87'); await mv(cl, { pts: cl.geom.pts.map(p => (p.x === 640 ? { ...p, x: 1306 } : p)) })
  const tb = one('36633af9'); await mv(tb, { ...tb.geom, leader: [{ x: 1712, y: -870 }, tb.geom.leader[1]] })
  const site = one('51220755')
  chk('site', await sb.from('room_annotations').update({ text: site.text.replace(/Stack space 650W x 1900H[^\n]*/, 'Wine fridge 650 space at the left wall (Vintec 595W x 610D x 1850H) - fridge sits ~12 proud of the panels, check vent clearances\nStack space 650W x 1900H - check washer / dryer + stacking kit sizes') }).eq('id', site.id))
}
for (const r of chk('a2', await sb.from('room_annotations').select('id,view,kind,geom,text').eq('room_id', R).eq('style->>src', 'markup-std'))) console.log(r.id.slice(0, 8), r.view, r.kind, JSON.stringify(r.geom).slice(0, 120), JSON.stringify(r.text)?.slice(0, 70))
