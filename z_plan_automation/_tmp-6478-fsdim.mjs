// RHK6478 vanities (Mark 2026-11-05):
// 1. 70 scribe strips in the US Main Ensuite / US Powder / DS Powder 33 end panels: back edge raw (edge_left = dx start = z 425 end).
// 2. Floating shelf height dims on the elevation in all 5 vanities: floor -> shelf underside | shelf 33 | shelf top -> carcass underside.
//    Insert only - no existing CAD is touched.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const ROOMS = { 'US Main Ensuite': '6e8f14c4-1325-4f07-b312-a6f9386d0245', 'US Bathroom': 'fbca7078-ae65-4e87-baf8-7bfe6ba55dda', 'Guest Ensuite': '9c8f3cbf-5d9d-43b9-9f81-c409417dc84b', 'US Powder': '14b571e0-ba97-410c-988a-6950e6da5780', 'DS Powder': 'e2a2d342-8475-4967-b1be-8387919acd1c' }
const STRIP_ROOMS = ['US Main Ensuite', 'US Powder', 'DS Powder']
const C_STRIP = 'BUILD UP FIRST: glue face to face onto the front 70 of the full-depth panel (wall side) = 33 END PANEL, scribe to wall. EDGE AFTER build-up - edge the 33 as one piece. Back edge raw (against the wall)'

for (const [name, R] of Object.entries(ROOMS)) {
  const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,wall_id,pos_x,pos_z,dy,has_carcass,float_shelf,part_comments').eq('room_id', R))
  if (STRIP_ROOMS.includes(name)) {
    for (const c of cabs.filter(c => /^TC-0[12]$/.test(c.label))) {
      const strips = chk('cp', await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', c.id).eq('name', 'Scribe strip 70 (wall side)'))
      if (strips.length !== 1) throw new Error(`${name} ${c.label}: ${strips.length} strips`)
      chk('edge', await sb.from('cabinet_custom_parts').update({ edge_left: false }).eq('id', strips[0].id))
      chk('cmt', await sb.from('cabinet_instances').update({ part_comments: { ...c.part_comments, ['custom_' + strips[0].id]: C_STRIP } }).eq('id', c.id))
    }
  }
  const shelf = cabs.find(c => c.float_shelf)
  const carc = cabs.filter(c => c.has_carcass && /^BC/.test(c.label))
  const under = Math.min(...carc.map(c => c.pos_z))
  if (!shelf || carc.some(c => c.pos_z !== under)) throw new Error(name + ': shelf / carcass heights')
  const bot = shelf.pos_z, top = shelf.pos_z + shelf.dy
  const x = Math.max(shelf.pos_x, carc.reduce((a, c) => Math.min(a, c.pos_x), Infinity)) + 120
  const el = { room_id: R, view: 'elevation', wall_id: shelf.wall_id, wall_side: 'face', kind: 'dim', style: {}, sort_order: 50 }
  const dim = (a, b) => ({ ...el, geom: { p1: { x, y: -a }, p2: { x, y: -b }, offset: 0, axis: 'y' } })
  const rows = [dim(0, bot), dim(bot, top), dim(top, under)]
  chk('dims', await sb.from('room_annotations').insert(rows))
  console.log(name, `x ${x}: floor-${bot} | shelf ${top - bot} | ${top}-${under} = ${under - top}`)
}
