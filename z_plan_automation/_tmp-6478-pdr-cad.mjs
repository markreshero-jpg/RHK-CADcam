// RHK6478 US Powder CAD: spec block (template order, colours only), SITE NOTES box on the Site notes layer,
// tap (20) @1100 / waste (40) @637, 545 in from the right wall, basin height dim (bench top -> basin top), notes.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '14b571e0-ba97-410c-988a-6950e6da5780', SITE_LAYER = '2931a12f-666e-4f16-9840-8a8b4e09da50'
const w2 = (await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).data.id
await sb.from('room_annotations').delete().eq('room_id', R)
const L = 2103, X = L - 545, TAP_H = 1100, WASTE_H = 637, NX = 2250
const el = { room_id: R, view: 'elevation', wall_id: w2, wall_side: 'face' }
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const spec = 'SPECIFICATIONS - {room}\n{job}\n\nBENCHTOP\n60mm YDL Bella Oro\n\nFRONTS + PANELS\nLx Sublime Teak Chalk\n\nCARCASS\n16mm Whiteboard\n\nFLOATING SHELF\nLx Sublime Teak Chalk'
const site = 'SITE NOTES\n2103 between walls (F/P), returns not measured\nCeiling 2692 TBC (20 floor allowance TBC)\nTap + waste 545 in from the right wall\nTap 1100 high, waste 637 high'
const rows = [
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 2800, y: 0 }, width: 80 }, sort_order: 1, text: spec, style: { ...box, block: 'Spec block' } },
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 2800, y: 1100 }, width: 80 }, sort_order: 2, text: site, cad_layer_id: SITE_LAYER, style: box },
  { ...el, kind: 'circle', geom: { c: { x: X, y: -TAP_H }, r: 10 }, style: {}, sort_order: 3 },
  { ...el, kind: 'circle', geom: { c: { x: X, y: -WASTE_H }, r: 20 }, style: {}, sort_order: 4 },
  { ...el, kind: 'dim', geom: { p1: { x: X, y: -TAP_H }, p2: { x: L, y: -TAP_H }, offset: -120, axis: 'x' }, style: {}, sort_order: 5 },
  { ...el, kind: 'dim', geom: { p1: { x: X + 200, y: -845 }, p2: { x: X + 200, y: -960 }, offset: 0, axis: 'y' }, style: {}, sort_order: 6 },
  { ...el, kind: 'text', geom: { at: { x: NX, y: -1300 }, width: 60, leader: [{ x: X + 12, y: -TAP_H }, { x: NX - 30, y: -1260 }] }, text: 'TAP (20 dia) 545 in from the right wall, 1100 high - basin centred on it', style: { size: 2.5 }, sort_order: 7 },
  { ...el, kind: 'text', geom: { at: { x: NX, y: -1000 }, width: 60, leader: [{ x: 2087, y: -600 }, { x: NX - 30, y: -960 }] }, text: '33 END PANELS each end: 16.5 full depth (495) + 16.5 x 70 scribe strip glued on the wall side at the front, 238.5-785 AFF - floating shelf underside to apron underside', style: { size: 2.5 }, sort_order: 8 },
  { ...el, kind: 'text', geom: { at: { x: NX, y: -700 }, width: 60, leader: [{ x: X + 22, y: -WASTE_H }, { x: NX - 30, y: -660 }] }, text: 'WASTE (40 dia) 545 in, 637 high - lands in the drawer box (178 box 506-684 AFF)', style: { size: 2.5 }, sort_order: 9 },
  { ...el, kind: 'text', geom: { at: { x: NX, y: -220 }, width: 60, leader: [{ x: 1500, y: -255 }, { x: NX - 30, y: -180 }] }, text: 'FLOATING SHELF 33 x 495 x 2037 between the end panels, LED strip at back, centre support (TBC)', style: { size: 2.5 }, sort_order: 10 },
]
// Elevation notes on the Site notes layer (not printed for the client) - all but the floating shelf note (Mark 2026-11-02).
for (const r of rows) if (r.view === 'elevation' && r.kind === 'text' && !r.text.startsWith('FLOATING SHELF')) r.cad_layer_id = SITE_LAYER
const { error } = await sb.from('room_annotations').insert(rows)
console.log(error?.message ?? 'ok')
