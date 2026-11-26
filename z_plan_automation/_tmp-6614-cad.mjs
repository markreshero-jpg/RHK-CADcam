// RHK6614 Upstairs Living Storage: spec block, SITE NOTES, colour callouts, TBC cloud (vent holes), site notes.
// Redo removes only its own untouched auto rows.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '65c69db5-2aba-49e0-81c8-95c559968aa2', P = 'b552f872-a0ad-4954-8e43-a5c4f4e0f301'
const mine = chk('n', await sb.from('room_annotations').select('id').eq('room_id', R).eq('style->>src', 'markup-std'))
if (mine.length) { chk('del', await sb.from('room_annotations').delete().in('id', mine.map(r => r.id))); console.log('removed own markup', mine.length) }
let layers = chk('l', await sb.from('job_cad_layers').select('id,name,sort_order').eq('project_id', P))
const want = [['General', '#000000', true], ['Site notes', '#16a34a', true], ['Questions for Client', '#0891b2', true]]
for (const [name, color, print] of want) if (!layers.find(l => l.name === name))
  chk('layer ' + name, await sb.from('job_cad_layers').insert({ project_id: P, name, color, visible: true, print, is_default: name === 'General', sort_order: layers.length + want.findIndex(w => w[0] === name) }))
layers = chk('l', await sb.from('job_cad_layers').select('id,name').eq('project_id', P))
console.log('layers', layers.map(l => l.name).join(', '))
const L = n => layers.find(x => x.name === n).id
const W2 = chk('w', await sb.from('walls').select('id,name').eq('room_id', R)).find(w => w.name === 'Wall 2').id
const T = { size: 2.5, align: 'center', src: 'markup-std' }, cloud = { src: 'markup-std', weight: 0.25, cloudBump: 4 }
const LD = { size: 2.5, arrowStart: 'closed', src: 'markup-std' }
const elev = (layer, kind, geom, text, style = T) => ({ room_id: R, view: 'elevation', wall_id: W2, wall_side: 'face', cad_layer_id: layer, kind, geom, text, style })
const plan = (layer, kind, geom, text, style = T) => ({ room_id: R, view: 'plan', cad_layer_id: layer, kind, geom, text, style })
const pts = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
// Notes right of the elevation (wall end 1020 + 90 wall), leader back to the target.
const note = (y, lx, ly) => ({ at: { x: 1300, y: -y }, width: 30, leader: [{ x: lx, y: -ly }, { x: 1290, y: -y + 25 }] })
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const spec = `SPECIFICATIONS - {room}
{job}

BENCHTOP
20mm SNB Stone Brecciata Primavera Dolomite

FRONTS + PANELS
Laminex Elegant Oak ABS Grain 18mm

HANDLES
Sharknose finger pull

CARCASS
16mm HMR Whiteboard

HARDWARE
Hinges: Blum Clip Top Blumotion`
const site = `SITE NOTES
Recess 1020 W x 600 D, ceiling 2655
Base 984 + 18 filler each side, 120 kick
Stone 875 FFL, wall to wall, 600 deep
Open shelving 984 on the stone, 18 shadowline
filler each side, 30 bulkhead to ceiling
Sizes from The Hive Co drawing rev 3.0 - site measure TBC`
const G = L('General'), S = L('Site notes'), Q = L('Questions for Client')
// Wall 2 elevation (x 0..1020): BFK 0-18 | B2D 18-1002 | BFK 1002-1020, kick 0-120, carcass to 855, stone 855-875.
// WF 0-18 | WOPN 18-1002 (875-2625, shelves 1490/1862/2234 tops) | WF 1002-1020, BH 2625-2655.
const rows = [
  plan(G, 'text', { at: { x: 1710, y: -200 }, width: 75 }, spec, { ...box, block: 'Spec block', src: 'markup-std' }),
  plan(S, 'text', { at: { x: 1710, y: 1350 }, width: 75 }, site, { ...box, src: 'markup-std' }),
  elev(G, 'text', note(2300, 900, 2100), 'OPEN SHELVING - ELEGANT OAK INSIDE + OUT (BACK, SHELVES, TOP)', LD),
  elev(G, 'text', note(1700, 1011, 1600), '18 SHADOWLINE FILLER EACH SIDE TO THE BENCH - ELEGANT OAK', LD),
  elev(G, 'text', note(1050, 800, 865), '20 STONE - SNB BRECCIATA PRIMAVERA DOLOMITE, WALL TO WALL, 600 DEEP', LD),
  elev(G, 'text', note(700, 750, 500), 'DOORS, FILLERS + KICK - ELEGANT OAK ABS GRAIN', LD),
  elev(Q, 'cloud', { pts: pts(60, -20, 960, -300) }, null, cloud),
  elev(Q, 'text', note(300, 960, 160), '59 x 5mm VENT HOLES - LOCATION TBC (KICK / BASE?)', LD),
  elev(S, 'text', note(2800, 900, 2640), '30 BULKHEAD TO CEILING 2655', LD),
]
chk('ins', await sb.from('room_annotations').insert(rows.map((r, i) => ({ ...r, sort_order: i + 1 }))))
console.log('inserted', rows.length)
process.exit(0)
