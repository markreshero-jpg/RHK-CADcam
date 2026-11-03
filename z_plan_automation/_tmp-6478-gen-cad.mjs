// RHK6478 Guest Ensuite CAD: spec block (template order, colours only), SITE NOTES box on the Site notes layer,
// tap (20) 510 in @1086 / waste (40) 543 in @625 from the left wall, notes.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '9c8f3cbf-5d9d-43b9-9f81-c409417dc84b', SITE_LAYER = '2931a12f-666e-4f16-9840-8a8b4e09da50'
const w2 = (await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).data.id
await sb.from('room_annotations').delete().eq('room_id', R)
const TAP = { x: 510, h: 1086 }, WASTE = { x: 543, h: 625 }, NX = 1750
const el = { room_id: R, view: 'elevation', wall_id: w2, wall_side: 'face' }
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const spec = 'SPECIFICATIONS - {room}\n{job}\n\nBENCHTOP\n60mm YDL Bella Oro\n\nFRONTS + PANELS\nLx Sublime Teak Chalk\n\nCARCASS\n16mm Whiteboard\n\nFLOATING SHELF\nLx Sublime Teak Chalk'
const site = 'SITE NOTES\nVanity 1000 from the left wall, right end seen\nBack wall length + right return not measured\nCeiling 2399 TBC (2419 off slab - 20 floor allowance TBC)\nTap 510 in from the left wall, 1086 high\nWaste 543 in, 625 high, off tile'
const rows = [
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 2300, y: 0 }, width: 80 }, sort_order: 1, text: spec, style: { ...box, block: 'Spec block' } },
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 2300, y: 1100 }, width: 80 }, sort_order: 2, text: site, cad_layer_id: SITE_LAYER, style: box },
  { ...el, kind: 'circle', geom: { c: { x: TAP.x, y: -TAP.h }, r: 10 }, style: {}, sort_order: 3 },
  { ...el, kind: 'circle', geom: { c: { x: WASTE.x, y: -WASTE.h }, r: 20 }, style: {}, sort_order: 4 },
  { ...el, kind: 'dim', geom: { p1: { x: 0, y: -TAP.h }, p2: { x: TAP.x, y: -TAP.h }, offset: -120, axis: 'x' }, style: {}, sort_order: 5 },
  { ...el, kind: 'dim', geom: { p1: { x: 0, y: -WASTE.h }, p2: { x: WASTE.x, y: -WASTE.h }, offset: 0, axis: 'x' }, style: {}, sort_order: 6 },
  { ...el, kind: 'text', geom: { at: { x: NX, y: -1300 }, width: 60, leader: [{ x: TAP.x + 12, y: -TAP.h }, { x: NX - 30, y: -1260 }] }, text: 'TAP (20 dia) 510 in from the left wall, 1086 high - basin centred on it', style: { size: 2.5 }, sort_order: 7 },
  { ...el, kind: 'text', geom: { at: { x: NX, y: -1000 }, width: 60, leader: [{ x: 987, y: -600 }, { x: NX - 30, y: -960 }] }, text: '30 FILLER at the wall + 16.5 END PANEL, drawer height only 485-785 AFF; top overhangs the end panel 5, apron returned on the right end', style: { size: 2.5 }, sort_order: 8 },
  { ...el, kind: 'text', geom: { at: { x: NX, y: -700 }, width: 60, leader: [{ x: WASTE.x + 22, y: -WASTE.h }, { x: NX - 30, y: -660 }] }, text: 'WASTE (40 dia) 543 in, 625 high', style: { size: 2.5 }, sort_order: 9 },
  { ...el, kind: 'text', geom: { at: { x: NX, y: -460 }, width: 60, leader: [{ x: 800, y: -600 }, { x: NX - 30, y: -420 }] }, text: 'INNER DRAWER behind the front: Dragon Pro 350 x 95, 113 front 617-730 AFF. Main drawer box 95 (506-602 AFF)', style: { size: 2.5 }, sort_order: 10 },
  { ...el, kind: 'text', geom: { at: { x: NX, y: -220 }, width: 60, leader: [{ x: 990, y: -200 }, { x: NX - 30, y: -180 }] }, text: 'FLOATING SHELF 33 x 495 x 995, seen right end, LED strip at back, centre support (TBC)', style: { size: 2.5 }, sort_order: 11 },
]
// Basin height (Mark 2026-11-02): bench top (845) to basin top (960) = 115, beside each basin.
const BASIN_TOPS = [510]
const wB = rows.find(r => r.view === 'elevation' && r.wall_id)?.wall_id
rows.push(...BASIN_TOPS.map((x, i) => ({ room_id: R, view: 'elevation', wall_id: wB, wall_side: 'face', kind: 'dim', geom: { p1: { x: x + 200, y: -845 }, p2: { x: x + 200, y: -960 }, offset: 0, axis: 'y' }, style: {}, sort_order: 40 + i })))
// Elevation notes on the Site notes layer (not printed for the client) - all but the floating shelf note (Mark 2026-11-02).
for (const r of rows) if (r.view === 'elevation' && r.kind === 'text' && !r.text.startsWith('FLOATING SHELF')) r.cad_layer_id = SITE_LAYER
const { error } = await sb.from('room_annotations').insert(rows)
console.log(error?.message ?? 'ok')
