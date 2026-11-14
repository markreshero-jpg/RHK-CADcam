// RHK6468 WIR markup (MARKUP-STANDARD): spec block + site notes, PTO tags, hanging rail notes, TBC questions.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const R = 'dfa682a3-020b-4704-8661-3dbbd6cdf224', P = '21601535-e1c8-4087-96b8-bb2506b96c3d'
const walls = Object.fromEntries(chk('w', await sb.from('walls').select('id,name').eq('room_id', R)).map(w => [w.name, w.id]))
const Q = chk('q', await sb.from('job_cad_layers').select('id').eq('project_id', P).eq('name', 'Questions for Client'))[0].id
const L = { general: '2cef1c43-289a-4bad-b300-6de894984764', site: '9f56ed36-2b15-4e9f-b2c8-2bce522384b8', q: Q }
const T = { size: 2.5, align: 'center', src: 'markup-std' }
const box = { src: 'markup-std', size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const cloud = { src: 'markup-std', weight: 0.25, cloudBump: 4 }
const rp = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
const el = (wall, layer, kind, geom, text, style = T) => ({ room_id: R, view: 'elevation', wall_id: walls[`Wall ${wall}`], wall_side: 'face', cad_layer_id: layer, kind, geom, text, style })
const pl = (layer, kind, geom, text, style = T) => ({ room_id: R, view: 'plan', cad_layer_id: layer, kind, geom, text, style })
const spec = ['SPECIFICATIONS - {room}', '{job}', '',
  'FRONTS + PANELS', '16mm Polytec Classic White Matt (for now)', 'End panels, kicks, bulkheads, open shelving + mirror frame to match', '',
  'HANDLES', 'None - push to open doors', 'Drawers: 25 finger gaps', '',
  'DRAWERS', 'Runners: Nikpol Dragon Pro soft close', '',
  'HARDWARE', 'Hinges: Blum + push to open', 'Hanging rails: oval', '',
  'CARCASS', '16.5 Whiteboard, 1mm white PVC edges'].join('\n')
const site = ['SITE NOTES',
  'Ceiling 2693 - talls to 2663, 30 bulkhead',
  'Kick 120 on all',
  'North wall 5638 less 2 x gyprock = 5614',
  'South wall 3869 less 1 x gyprock = 3857',
  'East wall 2202',
  'Nib 613 less gyprock = 601 - end panel flush with the nib',
  'South run 550 deep - stands 32 past the 518 return',
  'Mirrors + robe hooks by others (RHK frame only)'].join('\n')
const SX = 5614 + 90 + 600
const rows = [
  pl(L.general, 'text', { at: { x: SX, y: 0 }, width: 90 }, spec, { ...box, block: 'Spec block' }),
  pl(L.site, 'text', { at: { x: SX, y: 1700 }, width: 90 }, site, box),
  pl(L.q, 'text', { at: { x: 2300, y: 1000 }, width: 80 }, 'TBC: NORTH BAYS 934 / SOUTH BAYS 878 (SITE SIZES) - NOT IN LINE ACROSS THE AISLE. ALIGN?'),
]
// PTO on the tall doors: meeting edges, at the 1120 fixed shelf line (MARKUP: tall -> nearest fixed shelf)
const pto = (wall, edge) => [el(wall, L.general, 'text', { at: { x: edge - 175, y: -1180 } }, 'PTO', { size: 2.5 }), el(wall, L.general, 'text', { at: { x: edge + 75, y: -1180 } }, 'PTO', { size: 2.5 })]
rows.push(...pto(2, 3622.25), ...pto(2, 4556.75), ...pto(3, 1101), ...pto(4, 1029), ...pto(4, 1907))
// HANGING RAIL notes just under each rail (top rails ~2035 AFF bottom, lower rails 1051.5)
const rail = (wall, cx, aff) => el(wall, L.general, 'text', { at: { x: cx - 165, y: -(aff - 20) } }, 'HANGING RAIL', { size: 2.5 })
rows.push(rail(2, 3622.25, 2035), rail(2, 4556.75, 2035), rail(2, 4556.75, 1051.5), rail(3, 550, 2035), rail(3, 1651, 2035),
  rail(4, 1029, 2035), rail(4, 1029, 1051.5), rail(4, 1907, 2035))
// Notes in the spaces
rows.push(
  el(2, L.general, 'text', { at: { x: 1588 + 30, y: -1250 }, width: (633 - 60) / 20 }, 'SHOE SHELVES 15 DEG, FRONT LOW (DRAWN FLAT)'),
  el(4, L.general, 'text', { at: { x: 3224 + 30, y: -1250 }, width: (633 - 60) / 20 }, 'SHOE SHELVES 15 DEG, FRONT LOW (DRAWN FLAT)'),
  el(2, L.general, 'text', { at: { x: 200, y: -1700 }, width: (1571 - 400) / 20 }, 'ROBE HOOKS + MIRROR BY OTHERS'),
  el(6, L.general, 'text', { at: { x: 400, y: -1400 }, width: (1757 - 800) / 20 }, 'FULL HEIGHT MIRROR BY OTHERS\n32 FRAME BY RHK'),
  el(3, L.general, 'text', { at: { x: 30, y: -1300 }, width: (588 - 60) / 20 }, 'BLIND CORNER - FALSE PANEL'),
  el(3, L.general, 'text', { at: { x: 1101 + 513 + 30, y: -1300 }, width: (588 - 60) / 20 }, 'BLIND CORNER - FALSE PANEL'),
  // Questions
  el(2, L.q, 'cloud', { pts: rp(3170, -200, 5010, -2640) }, null, cloud),
  el(2, L.q, 'text', { at: { x: 3300, y: -2400 }, width: 70 }, 'TBC: DOORS ~2540 HIGH - PT MATT IN 2700 SHEETS?'),
  el(2, L.q, 'text', { at: { x: 200, y: -2400 }, width: (1571 - 400) / 20 }, 'TBC: COLOUR - PT CLASSIC WHITE MATT FOR NOW'),
)
const have = chk('have', await sb.from('room_annotations').select('view,kind,text,cad_layer_id,wall_id,style').eq('room_id', R))
const key = r => [r.view, r.kind, r.cad_layer_id, r.wall_id ?? '', r.text ?? '', JSON.stringify(r.geom ?? '')].join('|')
const seen = new Set(have.filter(h => h.style?.src === 'markup-std' || h.text === 'PTO' || h.text === 'HANGING RAIL').map(r => [r.view, r.kind, r.cad_layer_id, r.wall_id ?? '', r.text ?? ''].join('|')))
const todo = rows.filter(r => !seen.has([r.view, r.kind, r.cad_layer_id, r.wall_id ?? '', r.text ?? ''].join('|')) || r.text === 'PTO' || r.text === 'HANGING RAIL')
if (have.length) { console.log('room already has CAD, not re-inserting'); process.exit(0) }
chk('cad', await sb.from('room_annotations').insert(todo))
console.log('cad inserted', todo.length)
