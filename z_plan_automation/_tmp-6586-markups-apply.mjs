// RHK6586 kitchenette markups (Mark 2026-10-30, CAD layer "Drawing Markups For Ai"):
// 1. WC-10 WOPN open corner shelf (left of WC-04, front at 45 from the door face to the fridge tall side), WC-04 cut to 600.
// 2. Bulkheads painted MDF (MDF 18mm on the exposed role); WC-08 starts at the shelf, WC-11 BH over the shelf's 45 front.
// 3. A/C cut-out 500 x 150 drawn in CAD on the Wall 1 bulkhead.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) throw error }
const ROOM = 'a496c328-cfda-4f74-8c6d-175edd8e5907', MDF18 = '3b486c8f-ee1c-494d-b462-2dd206e3999d', W1 = '61f5cd9a-2563-4d63-91ce-1472839d8710'
const C = Object.fromEntries((await sb.from('cabinet_instances').select('*').eq('room_id', ROOM)).data.map(c => [c.label, c]))
const upd = async (l, patch) => { const { error } = await sb.from('cabinet_instances').update(patch).eq('id', C[l].id); console.log(error ? 'ERR ' + l + ' ' + error.message : 'ok ' + l) }
const seg = (p0, p1, id, role) => ({ type: 'line', p0, p1, edge: { id, role } })
const P = (x, y) => ({ x, y })

// WC-04 range cupboard: plain 600 box 268.5–868.5, one door hinged right (open shelf on its left).
await upd('WC-04', { pos_x: 268.5, dx: 600, footprint: null,
  face_grid: { cols: [{ col_index: 0, width_locked: false }], rows: [{ row_index: 0, height_locked: false }], zones: [{ col_index: 0, row_index: 0, face_type: 'door', hinge_side: 'right' }] } })

// WC-10 open shelf: local x = room x + 210. Back on the straight wall 0–268.5, right gable to the door face (380.5),
// front at 45 to the tall side (x − y = −420 in room), tall side back to the 45 wall, 45 wall back to the corner.
await upd('WC-10', { pos_x: -210, pos_y: 0, dx: 478.5, dy: 620, dz: 534.8, exposed_interior: true,
  notes: 'Open corner shelf (Mark markup 2026-10-30): same height as the overheads, front at 45 from the WC-04 door face to the fridge tall side.',
  footprint: { params: {}, segments: [
    seg(P(210, 0), P(478.5, 0), 'back', 'back'), seg(P(478.5, 0), P(478.5, 380.5), 'right', 'side'),
    seg(P(478.5, 380.5), P(324.2, 534.8), 'front', 'front'), seg(P(324.2, 534.8), P(0, 210), 'angle', 'side'),
    seg(P(0, 210), P(210, 0), 'back2', 'back')] } })

// WC-09 under panel: now only under the door overheads (shelf bottom sits at 1500 itself).
await upd('WC-09', { pos_x: 268.5, dx: 1650, footprint: null })

// Bulkheads: painted MDF. WC-08 starts at the shelf, its left fascia end at 22.5 (135 mitre with WC-11).
const bh = C['WC-08'].bulkhead
await upd('WC-08', { pos_x: 268.5, dx: 1666.5, material_overrides: { ...C['WC-08'].material_overrides, exposed: MDF18 },
  bulkhead: { ...bh, left: { on: false, depth: 600, joint: 'mitre', angle: 22.5 } } })
await upd('WC-07', { material_overrides: { ...C['WC-07'].material_overrides, exposed: MDF18 } })
await upd('WC-11', { dx: 217.8, dz: 459, material_overrides: { exposed: MDF18 },
  notes: 'Bulkhead over the open corner shelf front (45), flush with the shelf front; right end mitred 22.5 to WC-08.',
  bulkhead: { ...bh, front: 'carcase', left: { on: false, depth: 600, joint: 'mitre' }, right: { on: false, depth: 600, joint: 'mitre', angle: 22.5 } } })

// A/C cut-out on the Wall 1 bulkhead (WC-07, 655–1275 fridge space, 2120–2320): 500 x 150 centred.
const ac = (await sb.from('room_annotations').select('*').eq('room_id', ROOM).ilike('text', '%AC GRILLE%')).data[0]
{ const { error } = await sb.from('room_annotations').update({ text: 'A/C CUT-OUT 500W x 150H IN BULKHEAD', geom: { ...ac.geom, at: { x: ac.geom.at.x, y: -2268 } } }).eq('id', ac.id); console.log(error ? 'ERR note' : 'ok note') }
{ const { error } = await sb.from('room_annotations').insert({ room_id: ROOM, view: 'elevation', wall_id: W1, wall_side: 'face', kind: 'rect',
    geom: { a: { x: 715, y: -2295 }, b: { x: 1215, y: -2145 } }, style: { weight: 0.35, dash: 'solid' }, sort_order: ac.sort_order + 1, cad_layer_id: ac.cad_layer_id })
  console.log(error ? 'ERR rect ' + error.message : 'ok rect') }
