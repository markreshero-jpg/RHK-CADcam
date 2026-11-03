// RHK6542 White Study CAD: spec block, SITE NOTES (Site notes layer), elevation notes.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'a81555f3-22f3-4efd-947b-4e083bf49c94', SITE_LAYER = '43b0db6e-2234-476c-a39b-96a14d64399a'
const wid = async n => (await sb.from('walls').select('id').eq('room_id', R).eq('name', n).single()).data.id
const w1 = await wid('Wall 1'), w2 = await wid('Wall 2'), w5 = await wid('Wall 5')
const onlyBH = process.argv[2] === 'bulkheads'
if (!onlyBH) await sb.from('room_annotations').delete().eq('room_id', R)
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const spec = 'SPECIFICATIONS - {room}\n{job}\n\nFRONTS + PANELS\n16mm Lx Natural Walnut - Natural\n\nDESK TOP + SHELVES\n33mm Lx Natural Walnut - Natural\n\nROBE\n16mm Whiteboard\nEnd panels 16mm PT Classic White Matt\n\nHANDLES\nSet back SQ edge finger pull\nLinear Standard Archive 240 (drawers)\nLinear Standard Archive 912 (display door)\n\nHARDWARE\nHinges: Blum soft close\nRunners: Nikpol Dragon Pro white\n\nCARCASS\n16mm Whiteboard\n\nKICK\n80 Lx Natural Walnut (robe Whiteboard)\n\nBULKHEADS\n18mm MDF - painted by others'
const site = 'SITE NOTES\nCeiling 2540, 120 bulkheads to the ceiling (robe 140, top 2400)\nWalls: desk 4595, robe 3079, display 3080, balcony 2372\nDesk 2700 to the window (2750), top 732 finished\nOverheads underside 1430\nDisplay 2860 OA x 335 OA (balcony architrave 340)\nRobe 1816 OA x 600 OA, 520 carcass\nSliding doors 25mm Designer White - to come'
const note = (wall, x, w, y, text) => ({ room_id: R, view: 'elevation', wall_id: wall, wall_side: 'face', kind: 'text', geom: { at: { x: x + 30, y }, width: (w - 60) / 20 }, text, style: { size: 2.5, align: 'center' } })
const rows = [
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 4900, y: 0 }, width: 80 }, sort_order: 1, text: spec, style: { ...box, block: 'Spec block' } },
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 4900, y: 2100 }, width: 80 }, sort_order: 2, text: site, cad_layer_id: SITE_LAYER, style: box },
  { ...note(w1, 716.5, 1983.5, -1380, 'COB LED RECESSED IN UNDERSIDE (WITH UNDER PANEL) - ROUTE 18.5 x 9, 50 OFF BACK WALL (CONNECTION BY OTHERS)'), sort_order: 3 },
  { ...note(w1, 716.5, 1950, -560, 'DESK TOP 33 Lx NATURAL WALNUT 700 DEEP, 732 FINISHED'), sort_order: 4 },
  { ...note(w2, 16.5, 1783, -1300, 'SLIDING DOORS 25mm DESIGNER WHITE - TO COME'), sort_order: 5 },
]
// Bulkheads 2420-2540: one line inside each (Mark 2026-11-03).
const BH = 'MDF BULKHEAD - PAINTED BY OTHERS'
// left-aligned so it clears the bulkhead's centre size label
const bh = (wall, x, sort_order) => ({ room_id: R, view: 'elevation', wall_id: wall, wall_side: 'face', kind: 'text', geom: { at: { x: x + 30, y: -2510 }, width: 60 }, text: BH, style: { size: 2.5, align: 'left' }, sort_order })
const bhRows = [
  bh(w1, 0, 6), { ...bh(w2, 0, 7), geom: { at: { x: 30, y: -2532 }, width: 30 } }, bh(w5, 220, 8),   // robe bulkhead 1816 wide: note wraps to clear its size label
]
const { error } = await sb.from('room_annotations').insert(onlyBH ? bhRows : [...rows, ...bhRows])
console.log(error?.message ?? 'ok')
