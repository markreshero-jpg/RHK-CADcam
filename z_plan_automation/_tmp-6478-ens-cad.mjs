// RHK6478 US Main Ensuite CAD: spec block, tap (20) / waste (40) circles at the site centres on Wall 2, notes, LV wire on Wall 1.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '6e8f14c4-1325-4f07-b312-a6f9386d0245'
const wid = async n => (await sb.from('walls').select('id').eq('room_id', R).eq('name', n).single()).data.id
const w1 = await wid('Wall 1'), w2 = await wid('Wall 2')
await sb.from('room_annotations').delete().eq('room_id', R)
const TAP_H = 1110, WASTE_H = 640, L = 1662
const taps = [407, L - 414], wastes = [408, L - 398]
const el = (wall_id) => ({ room_id: R, view: 'elevation', wall_id, wall_side: 'face' })
const spec = 'SPECIFICATIONS - {room}\n{job}\n\nBENCHTOP\n60mm YDL Bella Oro\n\nFRONTS + PANELS\nLx Sublime Teak Chalk\n\nCARCASS\n16mm Whiteboard\n\nFLOATING SHELF\nLx Sublime Teak Chalk'
const site = 'SITE NOTES\n1662 between walls, 800 returns\nCeiling 2692 (2712 off slab - 20 floor allowance TBC)\nTaps 407 / 414 in, 1110 high TBC\nWastes 408 / 398 in, 640 high TBC\nLV wire 500 AFF (520 less floor), left wall'
const SITE_LAYER = '2931a12f-666e-4f16-9840-8a8b4e09da50'
const rows = [
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 2350, y: 0 }, width: 80 }, sort_order: 1, text: spec,
    style: { size: 2.5, bgPad: 2, block: 'Spec block', border: 'box', lineSpacing: 1.3, borderWeight: 0.35 } },
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 2350, y: 1100 }, width: 80 }, sort_order: 20, text: site, cad_layer_id: SITE_LAYER,
    style: { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 } },
  ...taps.map((x, i) => ({ ...el(w2), kind: 'circle', geom: { c: { x, y: -TAP_H }, r: 10 }, style: {}, sort_order: 2 + i })),
  ...wastes.map((x, i) => ({ ...el(w2), kind: 'circle', geom: { c: { x, y: -WASTE_H }, r: 20 }, style: {}, sort_order: 4 + i })),
  { ...el(w2), kind: 'dim', geom: { p1: { x: 0, y: -TAP_H }, p2: { x: taps[0], y: -TAP_H }, offset: -120, axis: 'x' }, style: {}, sort_order: 6 },
  { ...el(w2), kind: 'dim', geom: { p1: { x: taps[1], y: -TAP_H }, p2: { x: L, y: -TAP_H }, offset: -120, axis: 'x' }, style: {}, sort_order: 7 },
  { ...el(w2), kind: 'dim', geom: { p1: { x: 0, y: -WASTE_H }, p2: { x: wastes[0], y: -WASTE_H }, offset: 0, axis: 'x' }, style: {}, sort_order: 8 },
  { ...el(w2), kind: 'dim', geom: { p1: { x: wastes[1], y: -WASTE_H }, p2: { x: L, y: -WASTE_H }, offset: 0, axis: 'x' }, style: {}, sort_order: 9 },
  { ...el(w2), kind: 'text', geom: { at: { x: 1850, y: -1300 }, width: 60, leader: [{ x: taps[1] + 12, y: -TAP_H }, { x: 1820, y: -1260 }] }, text: 'TAPS (20 dia) at site centres 407 / 414 in - height 1110 TBC', style: { size: 2.5 }, sort_order: 10 },
  { ...el(w2), kind: 'text', geom: { at: { x: 1850, y: -700 }, width: 60, leader: [{ x: wastes[1] + 22, y: -WASTE_H }, { x: 1820, y: -660 }] }, text: 'WASTES (40 dia) at site centres 408 / 398 in - height 640 TBC', style: { size: 2.5 }, sort_order: 11 },
  { ...el(w2), kind: 'text', geom: { at: { x: 1850, y: -460 }, width: 60, leader: [{ x: 1300, y: -600 }, { x: 1820, y: -420 }] }, text: 'INNER DRAWER behind each front: Dragon Pro 400 x 95, 113 front 617-730 AFF. Main drawer box 95 (506-602 AFF)', style: { size: 2.5 }, sort_order: 12 },
  { ...el(w2), kind: 'text', geom: { at: { x: 1850, y: -220 }, width: 60, leader: [{ x: 831, y: -200 }, { x: 1820, y: -180 }] }, text: 'FLOATING SHELF 33 x 495 full depth, LED strip at back, centre support (TBC)', style: { size: 2.5 }, sort_order: 13 },
  { ...el(w2), kind: 'text', geom: { at: { x: 1850, y: -1000 }, width: 60, leader: [{ x: 1654, y: -560 }, { x: 1820, y: -960 }] }, text: '33 END PANELS each end: 16.5 full depth (495) + 16.5 x 70 scribe strip glued on the wall side at the front, 238.5-785 AFF - floating shelf underside to apron underside', style: { size: 2.5 }, sort_order: 16 },
  { ...el(w1), kind: 'text', geom: { at: { x: 450, y: -620 }, width: 40 }, text: 'LV WIRE 500 AFF (520 less floor), near the back corner', style: { size: 2.5 }, sort_order: 14 },
  { ...el(w1), kind: 'circle', geom: { c: { x: 770, y: -500 }, r: 10 }, style: {}, sort_order: 15 },
]
// Basin height (Mark 2026-11-02): bench top (845) to basin top (960) = 115, beside each basin.
const BASIN_TOPS = [408,1264]
const wB = rows.find(r => r.view === 'elevation' && r.wall_id)?.wall_id
rows.push(...BASIN_TOPS.map((x, i) => ({ room_id: R, view: 'elevation', wall_id: wB, wall_side: 'face', kind: 'dim', geom: { p1: { x: x + 200, y: -845 }, p2: { x: x + 200, y: -960 }, offset: 0, axis: 'y' }, style: {}, sort_order: 40 + i })))
// Elevation notes on the Site notes layer (not printed for the client) - all but the floating shelf note (Mark 2026-11-02).
for (const r of rows) if (r.view === 'elevation' && r.kind === 'text' && !r.text.startsWith('FLOATING SHELF')) r.cad_layer_id = SITE_LAYER
const { error } = await sb.from('room_annotations').insert(rows)
console.log(error?.message ?? 'ok')
