// RHK6478 Kitchen CAD (Mark 2026-11-05) - insert only, no existing CAD touched:
// 1. Microwave = CAD only: the fixture row goes (it sits behind the TC-07 pocket doors), a dashed outline + note on the
//    Wall 2 elevation and a dashed outline on the plan, same size / place (906-1426 along Wall 2, 1550-1860 AFF, 210-610 off the wall).
// 2. Plan dim: island back panel BC-14 face (y 2850) to the back of the bench (y 3150).
// 3. Island elevation (Wall 5 face) notes on the printing layer: "TALL DRAWER" on BC-06, "BIN" on BC-09.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6', W2 = '59df77b8-5806-4626-8a0c-8ef2abc3f3ce', W5 = 'c6531864-e0a3-45a8-a8f3-d5218464da86'
const MW = '57d64ac6-c25e-4ae3-9290-c46616c89bb1'
const have = chk('have', await sb.from('room_annotations').select('text,kind,geom').eq('room_id', R))
const has = t => have.some(a => a.text === t)
const rows = []
const mw = chk('mw', await sb.from('room_fixtures').select('x,y,z,width,depth,height').eq('id', MW)).at(0)
const MWT = 'MICROWAVE (model TBC) on the 1550 shelf, behind the pocket doors'
if (!has(MWT)) {
  const m = mw ?? { x: 906, y: 210, z: 1550, width: 520, depth: 400, height: 310 }
  const dash = { dash: 'dashed', weight: 0.25 }
  rows.push(
    { view: 'elevation', wall_id: W2, wall_side: 'face', kind: 'rect', geom: { a: { x: m.x, y: -(m.z + m.height) }, b: { x: m.x + m.width, y: -m.z } }, style: dash },
    { view: 'elevation', wall_id: W2, wall_side: 'face', kind: 'text', geom: { at: { x: m.x + 25, y: -(m.z + m.height) + 40 }, width: 45 }, text: MWT, style: { size: 2.5 } },
    { view: 'plan', kind: 'rect', geom: { a: { x: m.x, y: m.y }, b: { x: m.x + m.width, y: m.y + m.depth } }, style: dash },
  )
}
if (!have.some(a => a.kind === 'dim' && a.geom?.p1?.y === 2850 && a.geom?.p2?.y === 3150))
  rows.push({ view: 'plan', kind: 'dim', geom: { p1: { x: 2000, y: 2850 }, p2: { x: 2000, y: 3150 }, axis: 'y', offset: 0 }, style: {} })
if (!has('TALL DRAWER')) rows.push({ view: 'elevation', wall_id: W5, wall_side: 'face', kind: 'text', geom: { at: { x: 955, y: -470 }, width: 12 }, text: 'TALL DRAWER', style: { size: 2.5 } })
if (!has('BIN')) rows.push({ view: 'elevation', wall_id: W5, wall_side: 'face', kind: 'text', geom: { at: { x: 2870, y: -470 }, width: 12 }, text: 'BIN', style: { size: 2.5 } })
if (rows.length) chk('ins', await sb.from('room_annotations').insert(rows.map((r, k) => ({ room_id: R, sort_order: 90 + k, ...r }))))
if (mw) chk('mw del', await sb.from('room_fixtures').delete().eq('id', MW))
console.log('inserted', rows.length, 'microwave fixture', mw ? 'removed' : 'already gone')
