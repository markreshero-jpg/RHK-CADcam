// RHK6542 Danny's Robe: white kick face on KICK 1, spec block, SITE NOTES, elevation notes.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a', SITE_LAYER = '43b0db6e-2234-476c-a39b-96a14d64399a', WB = 'd081b2a1-38a8-472c-a415-f179699a1347'
console.log((await sb.from('cabinet_instances').update({ toekick_overrides: { face: WB } }).eq('room_id', R).eq('label', 'KICK 1')).error?.message ?? 'kick ok')
const w2 = (await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).data.id
await sb.from('room_annotations').delete().eq('room_id', R)
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const spec = 'SPECIFICATIONS - {room}\n{job}\n\nROBE\n16mm Whiteboard carcass, shelves, inner drawer fronts, flap + TV panel\n\nHARDWARE\nHinges: Blum soft close\nRunners: Nikpol Dragon Pro white\nHanging rails: Finista oval chrome\n\nKICK\n80 Whiteboard\n\nBULKHEAD\n18mm MDF - painted by others'
const site = 'SITE NOTES\nCeiling 2540, robe 2400, 140 bulkhead\nRobe 3000 wall to wall, 30 fillers each end\nCarcass 580 deep, 125 sliding door zone in front\nNo LV wire coming through the wall - TV cables run behind the false panel\nSliding doors - to come'
const note = (x, w, y, text) => ({ room_id: R, view: 'elevation', wall_id: w2, wall_side: 'face', kind: 'text', geom: { at: { x: x + 30, y }, width: (w - 60) / 20 }, text, style: { size: 2.5, align: 'center' } })
const pt = (x, y, text) => ({ room_id: R, view: 'elevation', wall_id: w2, wall_side: 'face', kind: 'text', geom: { at: { x, y } }, text, style: { size: 2.5 } })
const rows = [
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 3300, y: 0 }, width: 80 }, text: spec, style: { ...box, block: 'Spec block' } },
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 3300, y: 1500 }, width: 80 }, text: site, cad_layer_id: SITE_LAYER, style: box },
  pt(316, -1884, 'HANGING RAIL'),
  pt(2353, -1884, 'HANGING RAIL'),
  note(30, 902.5, -420, 'SHOE PULL-OUT SHELF 16 WHITEBOARD WITH 100 FRONT'),
  note(932.5, 1135, -1960, 'COB LED ROUTED IN UNDERSIDE OF TOP'),
  note(932.5, 1135, -1450, 'TV 48" ON FALSE PANEL AT HALF DEPTH - CABLES BEHIND PANEL (NO LV WIRE THROUGH WALL)'),
  note(932.5, 1135, -720, 'FLAP DOWN - HINGED OFF AV SHELF'),
  note(0, 3000, -2510, 'MDF BULKHEAD - PAINTED BY OTHERS'),
  note(2067.5, 902.5, -1300, 'SLIDING DOORS - TO COME'),
].map((r, i) => ({ ...r, sort_order: i + 1 }))
const { error } = await sb.from('room_annotations').insert(rows)
console.log(error?.message ?? 'notes ok')
