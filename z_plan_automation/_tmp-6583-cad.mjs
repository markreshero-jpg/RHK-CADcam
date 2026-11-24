// RHK6583 Piggott bathroom cupboard: spec block, SITE NOTES, mirror outlines, TBC clouds, notes. Redo removes only its own rows.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '33e64c8a-ebf9-498f-86d1-9879b1ccba0d', P = '52ebcec4-f8c0-4047-a9ce-13c027fef9b9'
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
const LD = { size: 2.5, arrowStart: 'closed', src: 'markup-std' }
const DIM = { size: 2.5, weight: 0.18, arrowEnd: 'closed_open', arrowSize: 1.5, arrowStart: 'closed_open', src: 'markup-std' }
const dash = { src: 'markup-std', dash: 'dashed', weight: 0.25 }
const elev = (layer, kind, geom, text, style = T) => ({ room_id: R, view: 'elevation', wall_id: W2, wall_side: 'face', cad_layer_id: layer, kind, geom, text, style })
const plan = (layer, kind, geom, text, style = T) => ({ room_id: R, view: 'plan', cad_layer_id: layer, kind, geom, text, style })
const pts = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
const note = (y, lx, ly) => ({ at: { x: 1450, y: -y }, width: 30, leader: [{ x: lx, y: -ly }, { x: 1440, y: -y + 25 }] })
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const spec = `SPECIFICATIONS - {room}
{job}

FRONTS + PANELS
Gloss White - colour TBC

MIRRORS
Mirror inset in both doors, routed from the back

HANDLES
TBC

CARCASS
Whiteboard, 1mm white PVC edges

DRAWERS
Nikpol Dragon Pro - white

HARDWARE
Hinges: Blum soft close
Runners: Nikpol Dragon Pro soft close`
const site = `SITE NOTES
Supply only, ex factory. No site measure.
Freestanding cupboard 670 W x 2420 H x 490 D overall (depth incl doors)
No kick. Sits on 5mm plastic feet.
5 clear to the ceiling (client's drawing 24.11.26)
End panels both sides, 2 pac`
const G = L('General'), S = L('Site notes'), Q = L('Questions for Client')
// Wall 2 elevation: LH panel 300-318, cupboard 318-952 (doors meet at 635), RH panel 952-970.
// Mirrors drawn 60 in from each door edge, 100 up, top at 2000 (size OK'd by Mark 2026-11-24; mirror door style to come).
// Fixed shelf top at 300, inner drawer 178 (front 18.5-214.5, 2 up from the base).
const rows = [
  plan(G, 'text', { at: { x: 1960, y: -400 }, width: 75 }, spec, { ...box, block: 'Spec block', src: 'markup-std' }),
  plan(S, 'text', { at: { x: 1960, y: 1100 }, width: 75 }, site, { ...box, src: 'markup-std' }),
  // Overall depth: back wall face (y 0) to the door faces (470 carcass + 18 door + 2 = 490).
  plan(G, 'dim', { p1: { x: 970, y: 0 }, p2: { x: 970, y: 490 }, axis: 'y', offset: 120 }, null, DIM),
  plan(G, 'text', { at: { x: 1110, y: 560 }, width: 16 }, '490 OVERALL DEPTH INCL DOORS', { size: 2.5, src: 'markup-std' }),
  elev(G, 'rect', { a: { x: 380, y: -100 }, b: { x: 575, y: -2000 } }, null, dash),
  elev(G, 'rect', { a: { x: 695, y: -100 }, b: { x: 890, y: -2000 } }, null, dash),
  elev(G, 'text', { at: { x: 385, y: -1500 }, width: 9 }, 'MIRROR INSET'),
  elev(G, 'text', { at: { x: 700, y: -1500 }, width: 9 }, 'MIRROR INSET'),
  elev(G, 'text', note(2250, 890, 2000), 'MIRROR INSET, ROUTED FROM THE BACK OF THE DOOR', LD),
  elev(Q, 'cloud', { pts: pts(1420, -1875, 2090, -1690) }, null, cloud),
  elev(Q, 'text', note(1850, 961, 1800), 'GLOSS WHITE - COLOUR TBC', LD),
  elev(Q, 'cloud', { pts: pts(1430, -1310, 2080, -1220) }, null, cloud),
  elev(Q, 'text', note(1300, 650, 1210), 'HANDLES TBC - 2 OFF', LD),
  elev(G, 'text', note(900, 800, 120), 'INNER DRAWER 178 DRAGON PRO, FRONT 2 UP FROM THE BASE', LD),
  elev(S, 'text', note(330, 940, 0), '5mm PLASTIC FEET, NO KICK', LD),
  elev(S, 'text', { at: { x: 470, y: -1848 } }, 'HANGING RAIL', { size: 2.5, src: 'markup-std' }),
  elev(S, 'dim', { p1: { x: 300, y: -2000 }, p2: { x: 300, y: -2420 }, axis: 'y', offset: -200 }, null, DIM),
  elev(S, 'dim', { p1: { x: 300, y: -300 }, p2: { x: 300, y: -2000 }, axis: 'y', offset: -200 }, null, DIM),
  elev(S, 'dim', { p1: { x: 300, y: 0 }, p2: { x: 300, y: -300 }, axis: 'y', offset: -200 }, null, DIM),
]
chk('ins', await sb.from('room_annotations').insert(rows.map((r, i) => ({ ...r, sort_order: i + 1 }))))
console.log('inserted', rows.length)
process.exit(0)
