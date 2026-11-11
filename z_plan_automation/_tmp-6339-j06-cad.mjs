// RHK6339 J06 + J07: spec block + SITE NOTES (plan), notes on the Wall 2 / Wall 3 elevations. Insert only.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef'
const GENERAL = '9768e64f-5133-4558-8375-b293405b976c', SITE = '82e5b80d-e0b7-4480-a64a-46af8e0b4d41'
const walls = Object.fromEntries((await sb.from('walls').select('id,name').eq('room_id', R)).data.map(w => [w.name, w.id]))
const ann = (await sb.from('room_annotations').select('id,text,sort_order').eq('room_id', R)).data
if (ann.some(a => a.text?.startsWith('SPECIFICATIONS'))) { console.log('CAD already there'); process.exit(0) }
let so = Math.max(0, ...ann.map(a => a.sort_order ?? 0))
const box = { src: 'markup-std', size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const tb = (cab) => ({ size: 2.5, align: 'center', bgPad: 1, border: 'box' })
const spec = ['SPECIFICATIONS - {room}', '{job}', '',
  'FRONTS + PANELS', 'Veneer Blackbutt 17, vertical grain', 'Kick + pelmet: Veneer Blackbutt', '',
  'OPEN SHELVING', 'Veneer Blackbutt 33 (sides, top, division, shelves)', 'Back: Veneer Blackbutt 17', '',
  'DESK + BENCH', '35 solid timber Blackbutt, clear matt lacquer', '50 recessed solid timber trim under the desk front', '',
  'HANDLES', 'Base doors: Sharknose finger pull', 'Tall doors: Custom Timber Pull 450', '',
  'HARDWARE', 'Hinges: Blum soft close', '',
  'CARCASS', 'PT Black Matt'].join('\n')
const site = ['SITE NOTES',
  'J06 wall 4508 - 12 gyprock = 4496 (Rory).',
  'J07 wall 3547 beam to frame (Rory final measure)',
  '+ 150 window filler past it = 3697.',
  '305 frame to back of jamb. J07 wall NOT gyprocked,',
  'cabinets fix straight to the frame.',
  'Desk + bench 735 FFL, beam underside 1492 above',
  '= 2227 FFL (talls + pelmet to the beam).',
  'Desk 830 deep in front of the 130 trough (nominal).',
  'Trough, window frame + steel outriggers BY OTHERS,',
  'outriggers fixed before wall lining.',
  'Desk join at the centre for now.',
  'TBC: J07 left bay 810 (drawing 760) so its side lines',
  'up with the desk front; open bays 1008.5 (drawing 940).',
  'TBC: LF-9 LED strip in the pelmet - by whom?'].join('\n')
const E3 = { view: 'elevation', wall_id: walls['Wall 3'], wall_side: 'face', kind: 'text' }
const E2 = { view: 'elevation', wall_id: walls['Wall 2'], wall_side: 'face', kind: 'text' }
const rows = [
  { view: 'plan', cad_layer_id: GENERAL, kind: 'text', text: spec, geom: { at: { x: 5400, y: -400 }, width: 90 }, style: { ...box, block: 'Spec block' } },
  { view: 'plan', cad_layer_id: SITE, kind: 'text', text: site, geom: { at: { x: 5400, y: 1900 }, width: 90 }, style: box },
  // Wall 3 (J07): x along the wall from the window corner, y = -height AFF.
  { ...E3, cad_layer_id: GENERAL, text: 'FIXED FRONT - CUPBOARD UNDER THE J06 DESK', geom: { at: { x: 180, y: -470 }, width: (810 - 60) / 20 }, style: tb() },
  { ...E3, cad_layer_id: GENERAL, text: 'NO BOTTOM - DESK TOP SEEN INSIDE', geom: { at: { x: 180, y: -2000 }, width: (810 - 60) / 20 }, style: tb() },
  { ...E3, cad_layer_id: GENERAL, text: 'OPEN SHELVES\nVENEER BLACKBUTT 33', geom: { at: { x: 990, y: -1300 }, width: (1008.5 - 60) / 20 }, style: tb() },
  { ...E3, cad_layer_id: GENERAL, text: '150 WINDOW FILLER', geom: { at: { x: -900, y: -1500 }, leader: [{ x: 75, y: -1450 }, { x: -180, y: -1450 }] }, style: { size: 2.5 } },
  { ...E3, cad_layer_id: GENERAL, text: '80 TIMBER PELMET TO THE BEAM', geom: { at: { x: 1100, y: -2420 }, leader: [{ x: 1500, y: -2190 }, { x: 1500, y: -2340 }] }, style: { size: 2.5 } },
  { ...E3, cad_layer_id: SITE, text: 'LF-9 LED IN PELMET TBC', geom: { at: { x: 1100, y: -2560 } }, style: { size: 2.5 } },
  { ...E3, cad_layer_id: GENERAL, text: 'DESK / BENCH 735 FFL', geom: { at: { x: 2000, y: -820 } }, style: { size: 2.5 } },
  // Wall 2 (J06 desk).
  { ...E2, cad_layer_id: GENERAL, text: 'J06 DESK - 35 SOLID TIMBER BLACKBUTT, 735 FFL. 50 RECESSED TRIM UNDER THE FRONT EDGE. JOIN AT THE CENTRE.', geom: { at: { x: 400, y: -1150 }, width: 80 }, style: tb() },
  { ...E2, cad_layer_id: GENERAL, text: 'TROUGH, WINDOW FRAME + STEEL OUTRIGGERS BY OTHERS', geom: { at: { x: 2650, y: -1150 }, width: 70 }, style: tb() },
]
for (const row of rows) {
  const r = await sb.from('room_annotations').insert({ room_id: R, ...row, sort_order: ++so }).select('id').single()
  console.log(row.view, row.text.split('\n')[0].slice(0, 40), r.error?.message ?? r.data.id)
}
