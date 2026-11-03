// RHK6478 US Bathroom CAD: spec block (template order, colours only), SITE NOTES box on the Site notes layer,
// tap (20) / waste (40) circles 855 apart centred on the wall (TBC), notes.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'fbca7078-ae65-4e87-baf8-7bfe6ba55dda', SITE_LAYER = '2931a12f-666e-4f16-9840-8a8b4e09da50'
const w2 = (await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).data.id
await sb.from('room_annotations').delete().eq('room_id', R)
const TAP_H = 1110, WASTE_H = 640, L = 2400, xs = [L / 2 - 427.5, L / 2 + 427.5]
const el = { room_id: R, view: 'elevation', wall_id: w2, wall_side: 'face' }
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const spec = 'SPECIFICATIONS - {room}\n{job}\n\nBENCHTOP\n60mm YDL Bella Oro\n\nFRONTS + PANELS\nLx Sublime Teak Chalk\n\nCARCASS\n16mm Whiteboard\n\nFLOATING SHELF\nLx Sublime Teak Chalk'
const site = 'SITE NOTES\nWall 2400 long (returns not measured)\nVanity 1750 centred on the wall\nCeiling 2692 TBC (as the ensuite; 20 floor allowance TBC)\nTaps 855 apart, 1110 high - position on the wall TBC\nWastes 640 high, all off w/proof tile\nLV wire @ 500 AFF, right of the vanity (position TBC)'
const rows = [
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 3100, y: 0 }, width: 80 }, sort_order: 1, text: spec, style: { ...box, block: 'Spec block' } },
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 3100, y: 1100 }, width: 80 }, sort_order: 2, text: site, cad_layer_id: SITE_LAYER, style: box },
  ...xs.map((x, i) => ({ ...el, kind: 'circle', geom: { c: { x, y: -TAP_H }, r: 10 }, style: {}, sort_order: 3 + i })),
  ...xs.map((x, i) => ({ ...el, kind: 'circle', geom: { c: { x, y: -WASTE_H }, r: 20 }, style: {}, sort_order: 5 + i })),
  { ...el, kind: 'dim', geom: { p1: { x: xs[0], y: -TAP_H }, p2: { x: xs[1], y: -TAP_H }, offset: -120, axis: 'x' }, style: {}, sort_order: 7 },
  { ...el, kind: 'text', geom: { at: { x: 2550, y: -1300 }, width: 60, leader: [{ x: xs[1] + 12, y: -TAP_H }, { x: 2520, y: -1260 }] }, text: 'TAPS (20 dia) 855 apart, 1110 high - centred on the wall, position TBC', style: { size: 2.5 }, sort_order: 8 },
  { ...el, kind: 'text', geom: { at: { x: 2550, y: -1000 }, width: 60, leader: [{ x: 2062, y: -600 }, { x: 2520, y: -960 }] }, text: '16.5 END PANELS drawer height only, 485-785 AFF under the apron; top overhangs 5, apron returned both ends', style: { size: 2.5 }, sort_order: 9 },
  { ...el, kind: 'text', geom: { at: { x: 2550, y: -700 }, width: 60, leader: [{ x: xs[1] + 22, y: -WASTE_H }, { x: 2520, y: -660 }] }, text: 'WASTES (40 dia) 640 high, under the taps', style: { size: 2.5 }, sort_order: 10 },
  { ...el, kind: 'text', geom: { at: { x: 2550, y: -460 }, width: 60, leader: [{ x: 1700, y: -600 }, { x: 2520, y: -420 }] }, text: 'INNER DRAWER behind each front: Dragon Pro 400 x 95, 113 front 617-730 AFF. Main drawer box 95 (506-602 AFF)', style: { size: 2.5 }, sort_order: 11 },
  { ...el, kind: 'text', geom: { at: { x: 2550, y: -220 }, width: 60, leader: [{ x: 2060, y: -200 }, { x: 2520, y: -180 }] }, text: 'FLOATING SHELF 33 x 495 x 1740, seen both ends, LED strip at back, centre support (TBC)', style: { size: 2.5 }, sort_order: 12 },
]
// Basin height (Mark 2026-11-02): bench top (845) to basin top (960) = 115, beside each basin.
const BASIN_TOPS = [773.25,1626.75]
const wB = rows.find(r => r.view === 'elevation' && r.wall_id)?.wall_id
rows.push(...BASIN_TOPS.map((x, i) => ({ room_id: R, view: 'elevation', wall_id: wB, wall_side: 'face', kind: 'dim', geom: { p1: { x: x + 200, y: -845 }, p2: { x: x + 200, y: -960 }, offset: 0, axis: 'y' }, style: {}, sort_order: 40 + i })))
// Elevation notes on the Site notes layer (not printed for the client) - all but the floating shelf note (Mark 2026-11-02).
for (const r of rows) if (r.view === 'elevation' && r.kind === 'text' && !r.text.startsWith('FLOATING SHELF')) r.cad_layer_id = SITE_LAYER
const { error } = await sb.from('room_annotations').insert(rows)
console.log(error?.message ?? 'ok')
