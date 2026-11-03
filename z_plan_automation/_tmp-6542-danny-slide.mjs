// RHK6542 Danny's Robe: 4 equal sliding doors drawn in CAD (plan + Wall 2 elevation).
// Ends on the back track, middle pair on the front track, 25 thick, tracks 30 apart.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a'
const W = 2984, H = 2400, T = 25, OV = 30, CARC = 580
const DW = (W + 2 * OV) / 4                       // 761
const BACK_Y = CARC + 30, FRONT_Y = BACK_Y + 30    // back door 610-635, front 640-665 (5 gap)
const doors = [
  { x: 0,            y: BACK_Y,  track: 'back' },
  { x: DW - OV,      y: FRONT_Y, track: 'front' },
  { x: 2 * DW - OV,  y: FRONT_Y, track: 'front' },
  { x: W - DW,       y: BACK_Y,  track: 'back' },
]
const w2 = (await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).data.id
const ink = { weight: 0.18 }   // thinnest CAD pen (CadRibbon WEIGHTS), layer colour
const TAG = 'sliding_door'
// Clear any earlier pass + the "to come" placeholder.
await sb.from('room_annotations').delete().eq('room_id', R).contains('style', { tag: TAG })
await sb.from('room_annotations').delete().eq('room_id', R).eq('text', 'SLIDING DOORS - TO COME')
const rows = []
const plan = (kind, geom, style = {}) => rows.push({ room_id: R, view: 'plan', kind, geom, style: { ...ink, ...style, tag: TAG } })
const elev = (kind, geom, style = {}, text = null) => rows.push({ room_id: R, view: 'elevation', wall_id: w2, wall_side: 'face', kind, geom, text, style: { ...ink, ...style, tag: TAG } })
for (const d of doors) {
  plan('rect', { a: { x: d.x, y: d.y }, b: { x: d.x + DW, y: d.y + T } })
  if (d.track === 'front') elev('rect', { a: { x: d.x, y: 0 }, b: { x: d.x + DW, y: -H } })
}
// Back doors: visible outline solid, the edge behind the front door dashed.
const L = doors[0], Rd = doors[3]
elev('line', { pts: [{ x: L.x + DW - OV, y: 0 }, { x: L.x, y: 0 }, { x: L.x, y: -H }, { x: L.x + DW - OV, y: -H }] })
elev('line', { pts: [{ x: L.x + DW, y: 0 }, { x: L.x + DW, y: -H }] }, { dash: 'dashed', weight: 0.18 })
elev('line', { pts: [{ x: Rd.x + OV, y: 0 }, { x: W, y: 0 }, { x: W, y: -H }, { x: Rd.x + OV, y: -H }] })
elev('line', { pts: [{ x: Rd.x, y: 0 }, { x: Rd.x, y: -H }] }, { dash: 'dashed', weight: 0.18 })
// Slide arrows + labels.
const arrow = { weight: 0.18, arrowEnd: 'closed', arrowSize: 2 }
for (const d of doors) {
  const cx = d.x + DW / 2, dir = d.track === 'back' ? (d.x === 0 ? 1 : -1) : (d.x < W / 2 ? -1 : 1)
  elev('line', { pts: [{ x: cx - dir * 150, y: -1095 }, { x: cx + dir * 150, y: -1095 }] }, arrow)
  elev('text', { at: { x: d.x + 30, y: -1175 }, width: (DW - 60) / 20 }, { size: 2.5, align: 'center' }, `${d.track.toUpperCase()} TRACK ${DW}W`)
}
plan('text', { at: { x: 30, y: FRONT_Y + T + 30 }, width: (W - 60) / 20 }, { size: 2.5, align: 'center' })
rows[rows.length - 1].text = `4 SLIDING DOORS ${T} THICK, ${DW} EACH (${OV} OVERLAP) - ENDS ON BACK TRACK, MIDDLE PAIR ON FRONT TRACK, TRACKS ${OV} APART`
const { error } = await sb.from('room_annotations').insert(rows)
console.log(error?.message ?? `inserted ${rows.length}`, { DW, BACK_Y, FRONT_Y })
// SITE NOTES: sliding doors line.
const site = (await sb.from('room_annotations').select('id,text,cad_layer_id').eq('room_id', R).like('text', 'SITE NOTES%').single()).data
const text = site.text.replace(/Sliding doors.*$/m, `Sliding doors - 4 x ${DW} x ${H} x ${T}, drawn in CAD only (detail to come)`)
console.log((await sb.from('room_annotations').update({ text }).eq('id', site.id)).error?.message ?? 'site ok', site.cad_layer_id)
