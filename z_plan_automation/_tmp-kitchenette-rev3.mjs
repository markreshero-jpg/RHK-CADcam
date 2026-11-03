// Temp: RHK6586 kitchenette rev 3 (Mark 2026-10-28): BFKANG in the corner, drawers -13, bench follows the filler.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) throw error }
const ROOM = 'a496c328-cfda-4f74-8c6d-175edd8e5907'
const chk = (what, { error, data }) => { if (error) throw new Error(what + ': ' + error.message); console.log('ok', what, data?.length ?? '') }
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,footprint').eq('room_id', ROOM)
const C = Object.fromEntries(cabs.map(c => [c.label, c]))
const r = v => Math.round(v * 1000) / 1000
// BFKANG (left hand: wall B = the 45 wall at wall 2's start). Same formulas as the preset.
const p = { ...C['BC-07'].footprint.params, depth: 575, fo: 18.5, fill_a: 40, fill_b: 50.1 }
const T = Math.tan(Math.PI / 8), S = Math.SQRT1_2, Co = Math.SQRT1_2
const la = p.fill_a + p.rev + p.fo * T, lb = p.fill_b + p.rev + p.fo * T
const cx = la + p.depth * T, LB = p.depth * T + lb, qx = cx + LB * Co, qy = LB * S, W = Math.max(cx, qx)
const R = [[0, 0], [cx, 0], [qx, qy], [qx - p.depth * S, qy + p.depth * Co], [la, p.depth], [0, p.depth]]
const pts = R.map(([x, y]) => ({ x: r(W - x), y: r(y) }))
const fp = C['BC-07'].footprint
const segments = fp.segments.map((s, i) => ({ ...s, p0: pts[i], p1: pts[(i + 1) % pts.length],
  edge: s.edge.filler ? { ...s.edge, filler: { ...s.edge.filler, width: s.edge.id === 'fill_a' ? p.fill_a : p.fill_b } } : s.edge }))
console.log('W', r(W), 'D', r(qy + p.depth), 'C at', r(W - cx), 'side_a', r(cx), 'pts', JSON.stringify(pts))
chk('BC-07', await sb.from('cabinet_instances').update({ footprint: { ...fp, params: p, segments }, dx: r(W), dz: r(qy + p.depth * Co),
  pos_x: -r(W - cx), pos_y: 0, pos_z: 0, dy: 880,
  notes: 'BFKANG angled corner filler - 40 beside the drawers, 50.1 on the 45 leg to the fridge tall side. Top + bottom run over the gables, gables set in 16.5 each side so the top / bottom can be planed to the real wall angle.' }).eq('id', C['BC-07'].id).select('id'))
// drawers -13 (side_a lands at 286.8)
chk('BC-03', await sb.from('cabinet_instances').update({ pos_x: 287, dx: 566 }).eq('id', C['BC-03'].id).select('id'))
chk('KICK 2', await sb.from('cabinet_instances').update({ pos_x: 287, dx: 1631.5 }).eq('id', C['KICK 2'].id).select('id'))
// bench follows the filler: front 6.5 past the faces (593.5 + 6.5 = 600 off both walls)
const { data: [bt] } = await sb.from('benchtop_instances').select('id,segments').eq('room_id', ROOM)
const prof = bt.segments.find(s => s.edge.profile_id).edge.profile_id
const k = 600 * Math.SQRT2, ts = -420.06   // bench line on the 45 leg: x + y = k; tall side: x - y = ts
const P = [[0, 0], [1940, 0], [1940, 600], [k - 600, 600], [(k + ts) / 2, (k - ts) / 2], [-210, 210]].map(([x, y]) => ({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }))
const open = new Set([1, 2, 3])
chk('bench ' + JSON.stringify(P), await sb.from('benchtop_instances').update({ polygon: P,
  segments: P.map((q, i) => ({ p0: q, p1: P[(i + 1) % P.length], type: 'line', edge: open.has(i) ? { wall: false, profile_id: prof } : { wall: true } })) }).eq('id', bt.id).select('id'))
