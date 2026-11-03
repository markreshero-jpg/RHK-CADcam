// Temp: RHK6586 kitchenette revision 2 (Mark 2026-10-28).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) throw error }
const ROOM = 'a496c328-cfda-4f74-8c6d-175edd8e5907', W1 = '61f5cd9a-2563-4d63-91ce-1472839d8710', W3 = '3d5eb5d8-ed21-4587-bfc0-57b11e4fef71'
const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000
const SH = 20 / Math.SQRT2   // 20 along wall 1 = (+14.142, -14.142)
const chk = (what, { error, data }) => { if (error) throw new Error(what + ': ' + error.message); console.log('ok', what, data ? data.length : '') }
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,pos_x,pos_y,pos_z,dy,wall_id,bulkhead').eq('room_id', ROOM)
const C = Object.fromEntries(cabs.map(c => [c.label, c]))
const upd = async (label, patch) => chk(label, await sb.from('cabinet_instances').update(patch).eq('id', C[label].id).select('id'))

// 1. Wall 3 gone - right end open
chk('delete wall 3', await sb.from('walls').delete().eq('id', W3).select('id'))
// 4. pantry + fridge run +20 along wall 1
for (const l of ['TC-02', 'TC-03', 'TC-04', 'TC-05', 'TC-06', 'BC-01', 'WC-06', 'WC-07'])
  await upd(l, { pos_x: r3(C[l].pos_x + SH), pos_y: r3(C[l].pos_y - SH) })
// 3. microwave box up so the 1530 fridge clears (20 vent); cupboard over it shortens
await upd('BC-01', { pos_z: 1550 })
await upd('WC-06', { dy: 197 })
// range cupboard follows the tall side (x - y = -420.06)
const cx = 210.0, fx = r1(362 - 420.06 + cx)   // front/angle point in cab coords
await upd('WC-04', { pos_x: -cx, dx: 1078.5, footprint: { params: {}, segments: [
  { p0: { x: cx, y: 0 }, p1: { x: 1078.5, y: 0 }, edge: { id: 'back', role: 'back' }, type: 'line', p0_expr: { x: String(cx), y: '0' } },
  { p0: { x: 1078.5, y: 0 }, p1: { x: 1078.5, y: 362 }, edge: { id: 'right', role: 'side' }, type: 'line', p0_expr: { x: 'cab.w', y: '0' } },
  { p0: { x: 1078.5, y: 362 }, p1: { x: fx, y: 362 }, edge: { id: 'front', role: 'front' }, type: 'line', p0_expr: { x: 'cab.w', y: 'cab.d' } },
  { p0: { x: fx, y: 362 }, p1: { x: 0, y: cx }, edge: { id: 'angle', role: 'side' }, type: 'line', p0_expr: { x: String(fx), y: 'cab.d' } },
  { p0: { x: 0, y: cx }, p1: { x: cx, y: 0 }, edge: { id: 'back2', role: 'back' }, type: 'line', p0_expr: { x: '0', y: String(cx) } },
] } })
// bulkhead over the overheads: left end on the tall side, right end now seen -> return
await upd('WC-08', { pos_x: -39.6, dx: 1974.6, bulkhead: { ...C['WC-08'].bulkhead, right: { on: true, depth: 380.5, joint: 'mitre' } } })
// 2. filler under the 45 bench edge: on wall 1 at s 1308, face 614 off the wall (6.5 behind the bench), own kick, under the apron
await upd('BC-02', { wall_id: W1, rotation: 315, pos_x: -210.03, pos_y: 210.03, pos_z: 0, dx: 71.7, dy: 840, dz: 595.5, has_toekick: true, kick_run_id: null,
  notes: 'Angled filler under the 45 bench edge (bench flush with the fridge panel face), own kick, stops 40 below the bench for the apron' })
await upd('KICK 2', { pos_x: 273, dx: 1645.5 })
// bench: 5 past the open right end panel, 45 edge from the drawers to the fridge panel face (620.5 off wall 1)
const { data: [bt] } = await sb.from('benchtop_instances').select('id,segments').eq('room_id', ROOM)
const prof = bt.segments.find(s => s.edge.profile_id).edge.profile_id
const P = [[0, 0], [1940, 0], [1940, 600], [277.5, 600], [228.7, 648.8], [-210, 210]].map(([x, y]) => ({ x, y }))
const open = new Set([1, 2, 3])
chk('bench', await sb.from('benchtop_instances').update({ polygon: P,
  segments: P.map((p, i) => ({ p0: p, p1: P[(i + 1) % P.length], type: 'line', edge: open.has(i) ? { wall: false, profile_id: prof } : { wall: true } })),
  notes: 'Kitchenette 20mm stone + 60 mitred apron (colour TBC), 600 deep, 900 top. 45 edge from the drawers flush with the fridge panel face; 5 past the open right end panel. Cooktop Miele CS7612FL, undermount sink 400 x 460.' }).eq('id', bt.id).select('id'))
// fixtures on wall 1 move with the run; microwave up 50
const { data: fx1 } = await sb.from('room_fixtures').select('id,x,y,z,kind').eq('room_id', ROOM).eq('wall_id', W1)
for (const f of fx1) chk(f.kind, await sb.from('room_fixtures').update({ x: r3(f.x + SH), y: r3(f.y - SH), z: f.kind === 'Microwave' ? f.z + 50 : f.z }).eq('id', f.id).select('id'))
// wall 1 elevation notes +20
const { data: an } = await sb.from('room_annotations').select('id,geom,text').eq('room_id', ROOM).eq('wall_id', W1)
for (const a of an) {
  const geom = { ...a.geom, at: { x: a.geom.at.x + 20, y: a.geom.at.y } }
  let text = a.text
  if (/^SMEG FRIDGE/.test(text)) { console.log('fridge note was:', text); text = 'SMEG FRIDGE 600 x 1530H (INC FEET) - MICROWAVE BOX RAISED TO 1550 SO IT CLEARS' }
  if (/^MICROWAVE BOX/.test(text)) geom.at.y -= 50
  chk('note ' + text.slice(0, 20), await sb.from('room_annotations').update({ geom, text }).eq('id', a.id).select('id'))
}
