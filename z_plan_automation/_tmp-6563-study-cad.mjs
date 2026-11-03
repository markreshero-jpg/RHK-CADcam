// RHK6563 Study CAD: spec block (template order, colours only), SITE NOTES box on the Site notes layer, shelf box notes.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '443a1553-14c4-4b8d-bd1f-2e5890b827e7', SITE_LAYER = 'fb50e2a9-559e-4a09-8490-cc7116892fbc'
const wid = async n => (await sb.from('walls').select('id').eq('room_id', R).eq('name', n).single()).data.id
const w2 = await wid('Wall 2'), w3 = await wid('Wall 3')
await sb.from('room_annotations').delete().eq('room_id', R)
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const spec = 'SPECIFICATIONS - {room}\n{job}\n\nDESK TOP\n33mm Lx Tasmanian Oak\n\nFRONTS + PANELS\nLx Tasmanian Oak\n\nHANDLES\nMomo Dallas 128 DBR\n\nCARCASS\n16mm Whiteboard\n\nOPEN SHELVES\n33mm Lx Tasmanian Oak'
const site = 'SITE NOTES\nCeiling 2155\nWalls: back 2044, left 1433, right 1431\nDesk top 750 finished\nTower 500 wide x 400 deep OA in the left corner\n30 bulkhead over the tower to the ceiling\nOpen shelf bottom 1400 AFF'
const note = (wall, x, w, y, text) => ({ room_id: R, view: 'elevation', wall_id: wall, wall_side: 'face', kind: 'text', geom: { at: { x: x + 30, y }, width: (w - 60) / 20 }, text, style: { size: 2.5, align: 'center' } })
const rows = [
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 2750, y: 0 }, width: 80 }, sort_order: 1, text: spec, style: { ...box, block: 'Spec block' } },
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 2750, y: 1600 }, width: 80 }, sort_order: 2, text: site, cad_layer_id: SITE_LAYER, style: box },
  { ...note(w2, 500, 1544, -1680, 'OPEN SHELF BOX 33 Lx TAS OAK'), sort_order: 3 },
  { ...note(w3, 300, 1131, -1680, 'OPEN SHELF BOX - NO LEFT END'), sort_order: 4 },
  { ...note(w3, 0, 1413, -1000, 'DESK TOP 33 Lx TAS OAK 600 DEEP, 750 FINISHED'), sort_order: 5 },
  { ...note(w2, 500, 944, -1000, 'DESK TOP 33 Lx TAS OAK 400 DEEP, 750 FINISHED'), sort_order: 6 },
]
const { error } = await sb.from('room_annotations').insert(rows)
console.log(error?.message ?? 'ok')
