// RHK6547 Laundry: doors handle 'none' (handles TBC, Mark 2026-11-16) + CAD markup standard:
// spec block, SITE NOTES, stack space + sink notes, TBC clouds, height dims. Redo removes only its own rows.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '20601f2b-4fa7-49c1-bfff-36d1d53ed308', P = '0e903bed-7a27-4278-a2b1-71e051e14290'

// Handles TBC -> no handle drawn / drilled
for (const c of chk('c', await sb.from('cabinet_instances').select('id,label,face_grid').eq('room_id', R).in('label', ['BC-01', 'BC-02', 'WC-01']))) {
  const fg = structuredClone(c.face_grid); for (const z of fg.zones) z.handle_id = 'none'
  chk('fg', await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id))
}

const mine = chk('n', await sb.from('room_annotations').select('id').eq('room_id', R).eq('style->>src', 'markup-std'))
if (mine.length) { chk('del', await sb.from('room_annotations').delete().in('id', mine.map(r => r.id))); console.log('removed own markup', mine.length) }
let layers = chk('l', await sb.from('job_cad_layers').select('id,name').eq('project_id', P))
console.log('layers', layers.map(l => l.name).join(', '))
const want = [['General', '#000000', 0], ['Site notes', '#16a34a', 5], ['Questions for Client', '#0891b2', 6]]
for (const [name, color, sort_order] of want) if (!layers.find(l => l.name === name))
  chk('layer ' + name, await sb.from('job_cad_layers').insert({ project_id: P, name, color, visible: true, print: true, is_default: name === 'General', sort_order }))
layers = chk('l', await sb.from('job_cad_layers').select('id,name').eq('project_id', P))
const L = n => layers.find(x => x.name === n).id
const walls = chk('w', await sb.from('walls').select('id,name').eq('room_id', R))
const W2 = walls.find(w => w.name === 'Wall 2').id
const T = { size: 2.5, align: 'center', src: 'markup-std' }, cloud = { src: 'markup-std', weight: 0.25, cloudBump: 4 }
const DIM = { size: 2.5, weight: 0.18, arrowEnd: 'closed_open', arrowSize: 1.5, arrowStart: 'closed_open', src: 'markup-std' }
const elev = (layer, kind, geom, text, style = T) => ({ room_id: R, view: 'elevation', wall_id: W2, wall_side: 'face', cad_layer_id: layer, kind, geom, text, style })
const plan = (layer, kind, geom, text, style = T) => ({ room_id: R, view: 'plan', cad_layer_id: layer, kind, geom, text, style })
const pts = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
// text box inside a cabinet: left + 30, width (w - 60) / 20 paper mm
const inCab = (left, w, y) => ({ at: { x: left + 30, y }, width: (w - 60) / 20 })
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const spec = `SPECIFICATIONS - {room}
{job}

BENCHTOP
18mm Laminex Elegant Oak Absolute Grain

FRONTS + PANELS
Laminex Elegant Oak Absolute Grain

HANDLES
TBC

CARCASS
{carcass}

HARDWARE
Blum soft close hinges`
const site = `SITE NOTES
SUPPLY ONLY
Room 2190 long (Georgie's email; sketch 2185) - check measure
Ceiling 2400: 30 bulkhead over the stack, cut 10 past the ceiling
Bench 900: 100 kick + 782 carcass + 18 Elegant Oak top (5 past the doors)
Washer / dryer stack opening 654 between the panels, stack kit by others
450 x 450 drop-in sink by others, centred on BC-02 - cut-out size TBC
Floating shelf: left off for now`
const G = L('General'), S = L('Site notes'), Q = L('Questions for Client')
const rows = [
  // Plan: right wall outer face 2190 + 90 = 2280 -> blocks at 2880.
  plan(G, 'text', { at: { x: 2880, y: -400 }, width: 75 }, spec, { ...box, block: 'Spec block', src: 'markup-std' }),
  plan(S, 'text', { at: { x: 2880, y: 1300 }, width: 75 }, site, { ...box, src: 'markup-std' }),
  // Elevation Wall 2
  elev(G, 'text', inCab(18, 654, -1150), 'WASHER / DRYER\nSTACK SPACE\n654W x 1770H'),
  elev(G, 'text', inCab(18, 654, -700), 'STACK KIT\nBY OTHERS'),
  elev(G, 'text', inCab(1190, 1000, -830), '450 x 450 DROP-IN SINK\nBY OTHERS'),
  elev(G, 'text', inCab(690, 1500, -980), '18mm LX ELEGANT OAK TOP'),
  // TBC: handles
  elev(Q, 'cloud', { pts: pts(760, -560, 1120, -700) }, null, cloud),
  elev(Q, 'text', inCab(690, 500, -605), 'HANDLES TBC'),
  // TBC: right wall filler
  elev(Q, 'cloud', { pts: pts(1640, -150, 2170, -300) }, null, cloud),
  elev(Q, 'text', { at: { x: 1660, y: -200 }, width: 24 }, 'WALL FILLER TBC (TIGHT?)'),
  // TBC: washer / dryer models
  elev(Q, 'cloud', { pts: pts(60, -400, 630, -540) }, null, cloud),
  elev(Q, 'text', inCab(18, 654, -445), 'W/D MODELS TBC'),
  // Height dims
  elev(S, 'dim', { p1: { x: 2190, y: 0 }, p2: { x: 2190, y: -900 }, axis: 'y', offset: 300 }, null, DIM),
  elev(S, 'dim', { p1: { x: 0, y: 0 }, p2: { x: 0, y: -1770 }, axis: 'y', offset: -300 }, null, DIM),
  elev(S, 'dim', { p1: { x: 0, y: -1770 }, p2: { x: 0, y: -2370 }, axis: 'y', offset: -300 }, null, DIM),
  elev(S, 'dim', { p1: { x: 0, y: -2370 }, p2: { x: 0, y: -2400 }, axis: 'y', offset: -300 }, null, DIM),
]
chk('ins', await sb.from('room_annotations').insert(rows.map((r, i) => ({ ...r, sort_order: i + 1 }))))
console.log('inserted', rows.length)
process.exit(0)
