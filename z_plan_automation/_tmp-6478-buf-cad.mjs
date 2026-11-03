// RHK6478 Buffet CAD: spec block (template order, colours only) + SITE NOTES box (Site notes layer) on the plan;
// elevation notes on the Site notes layer: bar fridges, mirror backs; fridge opening height dim.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = '0df13af4-8a6f-438f-a10d-6a9b4754aa97', SITE_LAYER = '2931a12f-666e-4f16-9840-8a8b4e09da50', L = 2345
const w2 = chk('wall', await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).id
const el = { room_id: R, view: 'elevation', wall_id: w2, wall_side: 'face' }
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const note = { size: 2.5, align: 'center' }
const inCab = (left, width) => ({ x: left + 30, w: (width - 60) / 20 })
const spec = 'SPECIFICATIONS - {room}\n{job}\n\nBENCHTOP\n60mm YDL Bella Oro\n\nFRONTS + PANELS\n2 Pac - colour TBC\n\nCARCASS\n16mm Whiteboard\n\nOPEN SHELVES\nLX 33mm Sublime Teak, mirror backs'
const site = 'SITE NOTES\n2345 F/P wall to wall, returns 612 / 604\nCeiling 2410 to bulkhead - 20 floor allowance (TBC) = 2390, 18 shadowline\nBar fridges x 2 - models TBC (620 openings, 840 to the apron)'
const rows = [
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: L + 700, y: 0 }, width: 80 }, text: spec, style: { ...box, block: 'Spec block' } },
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: L + 700, y: 1100 }, width: 80 }, text: site, cad_layer_id: SITE_LAYER, style: box },
  { ...el, kind: 'text', geom: { at: { x: inCab(0, 620).x, y: -560 }, width: inCab(0, 620).w }, text: 'BAR FRIDGE (model TBC) 620 opening', style: note },
  { ...el, kind: 'text', geom: { at: { x: inCab(638, 620).x, y: -560 }, width: inCab(638, 620).w }, text: 'BAR FRIDGE (model TBC) 620 opening', style: note },
  { ...el, kind: 'text', geom: { at: { x: 480, y: -250 }, width: 15 }, text: 'VENT SLOTS TBC', style: note },
  { ...el, kind: 'dim', geom: { p1: { x: 100, y: 0 }, p2: { x: 100, y: -840 }, offset: 0, axis: 'y' }, style: {} },
  { ...el, kind: 'text', geom: { at: { x: inCab(30, 1246).x, y: -1200 }, width: inCab(30, 1246).w }, text: 'MIRROR BACKS over the whiteboard back (TBC)', style: note },
]
for (const r of rows) if (r.view === 'elevation' && r.kind === 'text') r.cad_layer_id = SITE_LAYER
chk('del', await sb.from('room_annotations').delete().eq('room_id', R))
chk('ins', await sb.from('room_annotations').insert(rows.map((r, i) => ({ ...r, sort_order: i + 1 }))))
console.log('annotations', rows.length)
