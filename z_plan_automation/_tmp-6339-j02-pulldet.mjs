// RHK6339 J02 (Mark 2026-11-12): plan CAD detail box - timber pull section at the meeting edges, 1:4
// (5x real on the 1:20 plan), dims overridden to true sizes. Below the cupboard on the plan.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '67a27d07-1012-4537-a58d-5d3b50764221', GENERAL = '9768e64f-5133-4558-8375-b293405b976c'
const TAG = 'pull-detail'

const old = (await sb.from('room_annotations').select('id,style').eq('room_id', R).eq('view', 'plan')).data.filter(a => a.style?.src === TAG)
if (old.length) { console.log('replacing', old.length, 'items'); await sb.from('room_annotations').delete().in('id', old.map(a => a.id)) }

const K = 5, OX = 600, OY = 1050                       // real (u along the doors, v toward the room) -> plan mm
const P = (u, v) => ({ x: OX + K * u, y: OY + K * v })
const line = { src: TAG, weight: 0.35 }
const timber = { ...line, fill: 'tint', fillOpacity: 0.35 }
const rows = []
const add = (kind, geom, style = {}, text = null) => rows.push({ view: 'plan', cad_layer_id: GENERAL, kind, geom, style: { src: TAG, ...style }, text })
const poly = (pts, style) => add('line', { pts: pts.map(([u, v]) => P(u, v)), closed: true }, style)

// Frame + title.
add('rect', { a: { x: -150, y: 760 }, b: { x: 1250, y: 1850 } }, { weight: 0.35 })
add('text', { at: { x: -120, y: 790 }, width: 66 }, { size: 3.5, bold: true }, 'TIMBER PULL DETAIL 1:4')
// Doors (17 veneer), 1 gap at the meeting edges, shown 60 back from the edge.
poly([[-60.5, 0], [-0.5, 0], [-0.5, 17], [-60.5, 17]], line)
poly([[0.5, 0], [60.5, 0], [60.5, 17], [0.5, 17]], line)
// Pulls: 35 x 35, flush with the meeting edge, 18 x 18 rebate at the back on the hinge side.
poly([[-0.5, 17], [-0.5, 52], [-35.5, 52], [-35.5, 35], [-18.5, 35], [-18.5, 17]], timber)
poly([[0.5, 17], [0.5, 52], [35.5, 52], [35.5, 35], [18.5, 35], [18.5, 17]], timber)
// Dims (true sizes).
const dim = (a, b, offset, axis, text) => add('dim', { p1: P(...a), p2: P(...b), offset, axis }, {}, text)
dim([-60.5, 0], [-60.5, 17], -60, 'y', '17')
dim([-35.5, 52], [-0.5, 52], 150, 'x', '35')
dim([-35.5, 52], [-18.5, 52], 60, 'x', '18')
dim([35.5, 17], [35.5, 52], 150, 'y', '35')
dim([35.5, 17], [35.5, 35], 80, 'y', '18')
// Labels with leaders.
add('text', { at: { x: -120, y: 900 }, leader: [P(-45, 8), { x: 330, y: 925 }] }, { size: 2.5 }, 'DOOR 17 VENEER')
add('text', { at: { x: 950, y: 900 }, leader: [P(0, 6), { x: 940, y: 930 }] }, { size: 2.5 }, '1 GAP')
add('text', { at: { x: -120, y: 1200 }, leader: [P(-27, 27), { x: 240, y: 1225 }] }, { size: 2.5 }, 'FINGER GRIP')
// Notes.
add('text', { at: { x: -120, y: 1530 }, width: 66 }, { size: 2.5, lineSpacing: 1.3 }, [
  'SOLID BLACKBUTT 35 x 35 x 450',
  'ONE PER DOOR, 1050-1500 AFF',
  '18 x 18 REBATE HINGE SIDE, 2 ARRIS',
  'SECRET FIXED - NO CNC HOLES',
].join('\n'))

let so = Math.max(0, ...(await sb.from('room_annotations').select('sort_order').eq('room_id', R)).data.map(a => a.sort_order ?? 0))
for (const row of rows) {
  const r = await sb.from('room_annotations').insert({ room_id: R, wall_id: null, ...row, sort_order: ++so }).select('id').single()
  console.log(row.kind, (row.text ?? '').split('\n')[0], r.error?.message ?? 'ok')
}
