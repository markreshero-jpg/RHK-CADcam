// RHK6351 Bench Seat: CAD markup standard - spec block, SITE NOTES, front note, scribe TBC cloud, height dims. Redo removes only its own rows.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = 'e1ef206e-138d-45cc-953d-a1a0c21f2a02', P = '617e2130-d7e4-4e3a-95ef-c7e738eb3b8e'
const mine = chk('n', await sb.from('room_annotations').select('id').eq('room_id', R).eq('style->>src', 'markup-std'))
if (mine.length) { chk('del', await sb.from('room_annotations').delete().in('id', mine.map(r => r.id))); console.log('removed own markup', mine.length) }
let layers = chk('l', await sb.from('job_cad_layers').select('id,name').eq('project_id', P))
const want = [['General', '#000000', 0], ['Site notes', '#16a34a', 5], ['Questions for Client', '#0891b2', 6]]
for (const [name, color, sort_order] of want) if (!layers.find(l => l.name === name))
  chk('layer ' + name, await sb.from('job_cad_layers').insert({ project_id: P, name, color, visible: true, print: true, is_default: name === 'General', sort_order }))
layers = chk('l', await sb.from('job_cad_layers').select('id,name').eq('project_id', P))
const L = n => layers.find(x => x.name === n).id
const W2 = chk('w', await sb.from('walls').select('id,name').eq('room_id', R)).find(w => w.name === 'Wall 2').id
const T = { size: 2.5, align: 'center', src: 'markup-std' }, cloud = { src: 'markup-std', weight: 0.25, cloudBump: 4 }
const DIM = { size: 2.5, weight: 0.18, arrowEnd: 'closed_open', arrowSize: 1.5, arrowStart: 'closed_open', src: 'markup-std' }
const elev = (layer, kind, geom, text, style = T) => ({ room_id: R, view: 'elevation', wall_id: W2, wall_side: 'face', cad_layer_id: layer, kind, geom, text, style })
const plan = (layer, kind, geom, text, style = T) => ({ room_id: R, view: 'plan', cad_layer_id: layer, kind, geom, text, style })
const pts = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
const inCab = (left, w, y) => ({ at: { x: left + 30, y }, width: (w - 60) / 20 })
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const spec = `SPECIFICATIONS - {room}
{job}

FRONT + PANELS + SEAT TOP
16mm Polytec Woodmatt Tasmanian Oak

CARCASS
16mm Polytec Woodmatt Tasmanian Oak

KICK
Polytec Woodmatt Tasmanian Oak`
const site = `SITE NOTES
Alcove 2295 wall to wall, side walls 687 L / 690 R (site measure 2026-11-17)
Bench seat 450 high incl 120 kick, 680 deep overall (661.5 box + 16.5 front + 2)
Closed box, fixed panel front - no access
Centre division under the seat top
Box drawn tight wall to wall - scribe / fillers TBC`
const G = L('General'), S = L('Site notes'), Q = L('Questions for Client')
const rows = [
  // Plan: right wall outer face 2295 + 90 = 2385 -> blocks at 2985.
  plan(G, 'text', { at: { x: 2985, y: -400 }, width: 75 }, spec, { ...box, block: 'Spec block', src: 'markup-std' }),
  plan(S, 'text', { at: { x: 2985, y: 900 }, width: 75 }, site, { ...box, src: 'markup-std' }),
  elev(G, 'text', inCab(0, 900, -400), 'FIXED PANEL FRONT\nPT WOODMATT TAS OAK'),
  elev(Q, 'cloud', { pts: pts(1560, -190, 2240, -300) }, null, cloud),
  elev(Q, 'text', inCab(1530, 740, -275), 'SCRIBE / FILLERS TBC'),
  elev(S, 'dim', { p1: { x: 2295, y: 0 }, p2: { x: 2295, y: -120 }, axis: 'y', offset: 300 }, null, DIM),
  elev(S, 'dim', { p1: { x: 2295, y: -120 }, p2: { x: 2295, y: -450 }, axis: 'y', offset: 300 }, null, DIM),
  elev(S, 'dim', { p1: { x: 0, y: 0 }, p2: { x: 0, y: -450 }, axis: 'y', offset: -300 }, null, DIM),
]
chk('ins', await sb.from('room_annotations').insert(rows.map((r, i) => ({ ...r, sort_order: i + 1 }))))
console.log('inserted', rows.length)
process.exit(0)
