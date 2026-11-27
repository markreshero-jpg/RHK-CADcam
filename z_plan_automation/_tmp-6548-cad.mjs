// RHK6548 Hard Coffee markup (2026-11-27; rev 4: cup dispensers out, BC-03 inset): spec block + SITE NOTES (plan), colour callouts, TBC clouds, site notes (elevation)
// for Water Station / Front Counter / Back Counter / Back Kitchen. Redo removes only its own untouched auto rows.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const P = '31ed4cce-ffd3-4004-b8f1-d62f8dad6f5c'
let layers = chk('l', await sb.from('job_cad_layers').select('id,name').eq('project_id', P))
if (!layers.find(l => l.name === 'Questions for Client'))
  chk('layer', await sb.from('job_cad_layers').insert({ project_id: P, name: 'Questions for Client', color: '#0891b2', visible: true, print: true, is_default: false, sort_order: layers.length }))
layers = chk('l', await sb.from('job_cad_layers').select('id,name').eq('project_id', P))
const L = n => layers.find(x => x.name === n).id
const G = L('General'), S = L('Site notes'), Q = L('Questions for Client')
const T = { size: 2.5, align: 'center', src: 'markup-std' }, cloud = { src: 'markup-std', weight: 0.25, cloudBump: 4 }
const LD = { size: 2.5, arrowStart: 'closed', src: 'markup-std' }
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const pts = (x1, y1, x2, y2) => [{ x: x1, y: -y1 }, { x: x2, y: -y1 }, { x: x2, y: -y2 }, { x: x1, y: -y2 }]
const OAK = 'Polytec Blonde Oak Woodmatt (JF01)', WB = 'Whiteboard'
const specText = ({ top = true, fronts, carcass }) => ['SPECIFICATIONS - {room}', '{job}', '',
  ...(top ? ['BENCHTOP', 'Stainless steel by others', ''] : []),
  'FRONTS + PANELS', fronts, '', 'HANDLES', '128mm bar handle - TBC', '', 'CARCASS', carcass].join('\n')
const NOKICK = 'Cabinets sit on the existing site kicks - no kicks supplied'

const ROOMS = [
  { R: '2bed2187-0b9c-4cf3-9e3e-5d29be5538a0', wall: 'Wall 2', len: 590, top: 1300, spec: { fronts: OAK, carcass: OAK + ' (exposed)' },
    site: ['SITE NOTES', NOKICK, 'Box 752 + 18 shadowline = 770 overall', 'Stainless top by others'],
    notes: [
      [G, 650, 300, 600, 'OPEN BOX - BLONDE OAK WOODMATT INSIDE + OUT, FIXED SHELF'],
      [G, 400, 560, 761, '18 SHADOWLINE SET BACK 20 - BLONDE OAK. STAINLESS TOP BY OTHERS'],
      [S, 150, 300, 20, 'SITS ON EXISTING SITE KICK - NO KICK SUPPLIED'],
    ], clouds: [] },
  { R: '09786d9b-378e-42ed-9fc7-1aed4c7b21ab', wall: 'Wall 2', len: 2750, top: 2100, spec: { fronts: OAK, carcass: OAK + ' (exposed interiors)' },
    site: ['SITE NOTES', NOKICK, 'Cabinets 737 + 18 shadowline = 755 overall', 'Stainless top by others', 'Customer-side cladding not included'],
    notes: [
      [Q, 1250, 2000, 600, 'MICROWAVE - MODEL TBC. 320 CLEAR ALLOWED ABOVE FIXED SHELF'],
      [Q, 1000, 1550, 480, '128 HANDLE - MAKE / FINISH TBC'],
      [G, 800, 2700, 746, '18 SHADOWLINE FULL WIDTH - BLONDE OAK. STAINLESS TOP BY OTHERS'],
      [G, 600, 2600, 350, 'OPEN SHELVING + EXPOSED INTERIORS - BLONDE OAK WOODMATT'],
      [S, 400, 1600, 660, 'INSET DOOR FLUSH WITH CARCASS, 150 BELOW TOP - RUBBISH DROP'],
      [S, 200, 2400, 110, 'INNER DRAWER - FRONT 25 BELOW SHELF, NO HANDLE'],
      [S, 0, 600, 20, 'SITS ON EXISTING SITE KICK - NO KICK SUPPLIED'],
    ],
    clouds: [[1765, 380, 2235, 735], [1500, 380, 1600, 580]] },
  { R: 'd3c04ade-ba07-4462-a40c-2a4bd1952d31', wall: 'Wall 1', len: 600, top: 1300, spec: { fronts: OAK, carcass: WB },
    site: ['SITE NOTES', NOKICK, 'Cabinet 742 + 18 shadowline = 760 overall', 'Stainless top by others', '20 filler to nib wall'],
    notes: [
      [Q, 700, 300, 690, '128 HANDLES - MAKE / FINISH TBC'],
      [G, 500, 300, 751, '18 SHADOWLINE - BLONDE OAK. STAINLESS TOP BY OTHERS'],
      [G, 300, 9, 400, 'END PANEL + DRAWER FRONTS BLONDE OAK. CARCASS WHITEBOARD'],
      [S, 100, 300, 20, 'SITS ON EXISTING SITE KICK - NO KICK SUPPLIED'],
    ],
    clouds: [[200, 650, 400, 730]] },
  { R: 'e8b3c950-5be5-4e4a-9117-451395e9d2a1', wall: 'Wall 2', len: 665, top: 2100, spec: { top: false, fronts: WB, carcass: WB },
    site: ['SITE NOTES', NOKICK, 'Tall 2320 high, 30 fillers each side to suit 665 opening'],
    notes: [
      [G, 1900, 200, 1700, 'WHITEBOARD DOORS + FILLERS (WRITE-ON SURFACE)'],
      [Q, 1100, 330, 1000, '128 HANDLES - MAKE / FINISH TBC'],
      [S, 600, 650, 1200, '30 FILLER EACH SIDE - SCRIBE ON SITE'],
      [S, 200, 330, 20, 'SITS ON EXISTING SITE KICK - NO KICK SUPPLIED'],
    ],
    clouds: [[260, 900, 410, 1100]] },
]

let total = 0
for (const rm of ROOMS) {
  const mine = chk('n', await sb.from('room_annotations').select('id').eq('room_id', rm.R).eq('style->>src', 'markup-std'))
  if (mine.length) chk('del', await sb.from('room_annotations').delete().in('id', mine.map(r => r.id)))
  const W = chk('w', await sb.from('walls').select('id,name').eq('room_id', rm.R)).find(w => w.name === rm.wall).id
  const nx = rm.len + 280
  const elev = (layer, kind, geom, text, style) => ({ room_id: rm.R, view: 'elevation', wall_id: W, wall_side: 'face', cad_layer_id: layer, kind, geom, text, style })
  const plan = (layer, geom, text, style) => ({ room_id: rm.R, view: 'plan', cad_layer_id: layer, kind: 'text', geom, text, style })
  const rows = [
    plan(G, { at: { x: rm.len + 700, y: -200 }, width: 75 }, specText(rm.spec), { ...box, block: 'Spec block', src: 'markup-std' }),
    plan(S, { at: { x: rm.len + 700, y: 1250 }, width: 75 }, rm.site.join('\n'), { ...box, src: 'markup-std' }),
    // Notes stacked in the right margin, 50 paper mm wide (2 lines max at 1:20), 220 apart from the top down.
    ...rm.notes.map(([layer, , lx, ly, text], i) => { const y = rm.top - i * 220
      return elev(layer, 'text', { at: { x: nx, y: -y }, width: 50, leader: [{ x: lx, y: -ly }, { x: nx - 10, y: -y + 25 }] }, text, LD) }),
    ...rm.clouds.map(([x1, y1, x2, y2]) => elev(Q, 'cloud', { pts: pts(x1, y1, x2, y2) }, null, cloud)),
  ]
  chk('ins', await sb.from('room_annotations').insert(rows.map((r, i) => ({ ...r, sort_order: i + 1 }))))
  total += rows.length
}
console.log('inserted', total)
process.exit(0)
