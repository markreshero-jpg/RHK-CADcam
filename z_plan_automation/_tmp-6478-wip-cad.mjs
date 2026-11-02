// RHK6478 WIP CAD: spec block + SITE NOTES box on the plan; elevation notes (Site notes layer, LED strip notes print),
// PTO tags on the over-fridge pair, fridge opening dims.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae', SITE_LAYER = '2931a12f-666e-4f16-9840-8a8b4e09da50'
const walls = chk('walls', await sb.from('walls').select('id,name').eq('room_id', R)), W = Object.fromEntries(walls.map(w => [w.name, w.id]))
const e2 = { room_id: R, view: 'elevation', wall_id: W['Wall 2'], wall_side: 'face' }, e5 = { room_id: R, view: 'elevation', wall_id: W['Wall 5'], wall_side: 'face' }
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }, note = { size: 2.5, align: 'center' }
const inCab = (left, width) => ({ x: left + 30, w: (width - 60) / 20 })
const pto = (e, x, y) => ({ ...e, kind: 'text', geom: { at: { x, y } }, text: 'PTO', style: { size: 2.5 } })
const spec = 'SPECIFICATIONS - {room}\n{job}\n\nBENCHTOP\n60mm YDL Bella Oro\n\nFRONTS + PANELS\n2 Pac - colour TBC\n\nCARCASS\n16mm Whiteboard'
const site = 'SITE NOTES\nTop wall 2351 F/P, bottom wall 2348; returns 760 + 635 (garage), 763 + 638 (kitchen), 801 kitchen opening\nCeiling 2400 TBC - 20 floor allowance (TBC) = 2380, 18 shadowline\n200 x 200 box-out, top-left corner\nPlumbing 850-1040, waste 1250 @ 750H (bottom wall - check which end)\nExisting fridge 1809 H x 910-912 W x 758 D incl door\nD/W Bosch SMV6HCX03A, niche 815-875: 25 packer under\nSink Abey Piazza CR540, tap V&B LF Vita 213880 (drawn as stand-ins)'
const rows = [
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 3050, y: 0 }, width: 80 }, text: spec, style: { ...box, block: 'Spec block' } },
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 3050, y: 900 }, width: 95 }, text: site, cad_layer_id: SITE_LAYER, style: box },
  // Wall 2 (Elev 1)
  pto(e2, 563, -2200), pto(e2, 743, -2200),
  { ...e2, kind: 'dim', geom: { p1: { x: 286, y: -1000 }, p2: { x: 1218, y: -1000 }, offset: 0, axis: 'x' }, style: {} },
  { ...e2, kind: 'dim', geom: { p1: { x: 1150, y: 0 }, p2: { x: 1150, y: -1850 }, offset: 0, axis: 'y' }, style: {} },
  { ...e2, kind: 'text', geom: { at: { x: inCab(286, 932).x, y: -1500 }, width: inCab(286, 932).w }, text: 'EXISTING FRIDGE 1809 H x 910-912 W x 758 D incl door. Opening 932 x 1850', style: note },
  { ...e2, kind: 'text', geom: { at: { x: inCab(286, 932).x, y: -650 }, width: inCab(286, 932).w }, text: 'OPEN SHELVES at left: 238 wide x 400 deep (book depth), 250 off the wall in front of the 200 x 200 box-out, 5 adj', style: note },
  { ...e2, kind: 'text', geom: { at: { x: inCab(1236, 1085).x, y: -1260 }, width: inCab(1236, 1085).w }, text: 'STONE SPLASHBACK', style: note },
  { ...e2, kind: 'text', geom: { at: { x: inCab(1236, 1085).x, y: -1050 }, width: inCab(1236, 1085).w }, text: 'GPO INSIDE A DRAWER (TBC which)', style: note },
  { ...e2, kind: 'text', geom: { at: { x: inCab(1236, 1085).x, y: -1460 }, width: inCab(1236, 1085).w }, text: 'LED STRIPLIGHT under the open shelves', style: note },
  // Wall 5 (Elev 5): offsets run from the east (kitchen) end
  { ...e5, kind: 'text', geom: { at: { x: inCab(30, 600).x, y: -600 }, width: inCab(30, 600).w }, text: 'INTEGRATED D/W Bosch SMV6HCX03A, 2pac panel by RHK, 25 packer under', style: note },
  { ...e5, kind: 'text', geom: { at: { x: inCab(30, 1370).x, y: -1260 }, width: inCab(30, 1370).w }, text: 'STONE SPLASHBACK', style: note },
  { ...e5, kind: 'text', geom: { at: { x: inCab(30, 1370).x, y: -1460 }, width: inCab(30, 1370).w }, text: 'LED STRIPLIGHT under the overheads', style: note },
]
for (const r of rows) if (r.view === 'elevation' && r.kind === 'text' && !r.text.startsWith('LED')) r.cad_layer_id = SITE_LAYER
chk('del', await sb.from('room_annotations').delete().eq('room_id', R))
chk('ins', await sb.from('room_annotations').insert(rows.map((r, i) => ({ ...r, sort_order: i + 1 }))))
console.log('annotations', rows.length)
