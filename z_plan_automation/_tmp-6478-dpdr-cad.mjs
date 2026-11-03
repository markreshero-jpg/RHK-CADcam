// RHK6478 DS Powder CAD: spec block (template order, colours only), SITE NOTES box on the Site notes layer,
// spout centre line 600 from the left wall, basin height dim (bench top -> basin top), notes (all but the shelf note on Site notes).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'e2a2d342-8475-4967-b1be-8387919acd1c', SITE_LAYER = '2931a12f-666e-4f16-9840-8a8b4e09da50'
const w2 = (await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).data.id
await sb.from('room_annotations').delete().eq('room_id', R)
const L = 2351, X = L - 600, NX = 2500
const el = { room_id: R, view: 'elevation', wall_id: w2, wall_side: 'face' }
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const spec = 'SPECIFICATIONS - {room}\n{job}\n\nBENCHTOP\n60mm YDL Bella Oro\n\nFRONTS + PANELS\nLx Sublime Teak Chalk\n\nCARCASS\n16mm Whiteboard\n\nOPEN SHELVES + FLOATING SHELF\nLx Sublime Teak Chalk'
const site = 'SITE NOTES\n2351 between walls, left wall 1514, right wall 556 + 19 jamb\nCeiling 2399 TBC (2419 - 20 floor allowance TBC)\nSpout to move: basin + spout 600 from the right wall\nTap / waste heights TBC'
const rows = [
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: L + 700, y: 0 }, width: 80 }, sort_order: 1, text: spec, style: { ...box, block: 'Spec block' } },
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: L + 700, y: 1100 }, width: 80 }, sort_order: 2, text: site, cad_layer_id: SITE_LAYER, style: box },
  { ...el, kind: 'dim', geom: { p1: { x: X, y: -1100 }, p2: { x: L, y: -1100 }, offset: -120, axis: 'x' }, style: {}, sort_order: 3 },
  { ...el, kind: 'dim', geom: { p1: { x: X - 200, y: -820 }, p2: { x: X - 200, y: -960 }, offset: 0, axis: 'y' }, style: {}, sort_order: 4 },
  { ...el, kind: 'text', geom: { at: { x: NX, y: -1300 }, width: 60, leader: [{ x: X, y: -1000 }, { x: NX - 30, y: -1260 }] }, text: 'BASIN + SPOUT centred 600 from the right wall (spout to move). Waste comes down in the BC-03 drawer (178 box) - height TBC', style: { size: 2.5 }, sort_order: 5 },
  { ...el, kind: 'text', geom: { at: { x: NX, y: -1000 }, width: 60, leader: [{ x: 2343, y: -600 }, { x: NX - 30, y: -960 }] }, text: '33 END PANELS each end: 16.5 full depth (495) + 16.5 x 70 scribe strip glued on the wall side at the front, 213.5-760 AFF - floating shelf underside to apron underside', style: { size: 2.5 }, sort_order: 6 },
  { ...el, kind: 'text', geom: { at: { x: NX, y: -700 }, width: 60, leader: [{ x: 2218, y: -630 }, { x: NX - 30, y: -660 }] }, text: 'OPEN SHELF BAYS 200 each end (no front), flush with the drawer fronts, 460-760 AFF up to the apron underside, finished inside in Lx Sublime Teak Chalk', style: { size: 2.5 }, sort_order: 7 },
  { ...el, kind: 'text', geom: { at: { x: NX, y: -220 }, width: 60, leader: [{ x: 1700, y: -230 }, { x: NX - 30, y: -180 }] }, text: 'FLOATING SHELF 33 x 495 x 2285 between the end panels, LED strip at back, centre support (TBC)', style: { size: 2.5 }, sort_order: 8 },
]
// Elevation notes on the Site notes layer (not printed for the client) - all but the floating shelf note (Mark 2026-11-02).
for (const r of rows) if (r.view === 'elevation' && r.kind === 'text' && !r.text.startsWith('FLOATING SHELF')) r.cad_layer_id = SITE_LAYER
const { error } = await sb.from('room_annotations').insert(rows)
console.log(error?.message ?? 'ok')
