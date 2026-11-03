// RHK6478 Kitchen CAD: spec block + SITE NOTES box on the plan; elevation notes (Site notes layer, LED strip notes print),
// PTO tags on the over-oven + over-fridge pairs.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6', SITE_LAYER = '2931a12f-666e-4f16-9840-8a8b4e09da50'
const walls = chk('walls', await sb.from('walls').select('id,name').eq('room_id', R)), W = Object.fromEntries(walls.map(w => [w.name, w.id]))
const el = n => ({ room_id: R, view: 'elevation', wall_id: W[n], wall_side: 'face' })
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }, note = { size: 2.5, align: 'center' }
const inCab = (left, width) => ({ x: left + 30, w: (width - 60) / 20 })
const txt = (wall, left, width, y, text) => ({ ...el(wall), kind: 'text', geom: { at: { x: inCab(left, width).x, y }, width: inCab(left, width).w }, text, style: note })
const pto = (wall, x, y) => ({ ...el(wall), kind: 'text', geom: { at: { x, y } }, text: 'PTO', style: { size: 2.5 } })
const spec = 'SPECIFICATIONS - {room}\n{job}\n\nBENCHTOP\n60mm stone TBA\n\nFRONTS + PANELS\n2 Pac - colour TBC\n\nINTERNALS\nTimbergrain (Sublime Teak) - pocket unit, its overhead, side unit open bay\n\nCARCASS\n16mm Whiteboard'
const site = 'SITE NOTES\nBack wall 4866 to the seen panel, 831 open to the right wall; left 765 + jamb, 800 opening, 750 wall, stair stringer bay 1110\nCeiling 2710 off slab - 20 floor allowance (TBC) = 2690, 18 shadowline\nRaw stair stringer 1340 off slab (1320 AFF): side unit top 1300\nPlumbing 2190-2580 and 1953-2112 off the back wall (island - check)\nOvens Neff B69FS5CY0A + B69VS73Y0A + Z912BDY0 kit; cooktop Neff T68YYY4C0H; hood Falmec FP3MLD90S2 90\nFridge Liebherr IRBH5120 + freezer SIFNH5128 integrated, niche 1772-1788\nD/W Bosch SMV6HCX03A, niche 815-875: 25 packer under\nSink Meir MKSP-S380440, tap Meir MK17 Piccola (drawn as stand-ins)'
const rows = [
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 6100, y: 0 }, width: 80 }, text: spec, style: { ...box, block: 'Spec block' } },
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 6100, y: 1300 }, width: 95 }, text: site, cad_layer_id: SITE_LAYER, style: box },
  // Wall 2 (Elev 2, back run, from the left wall)
  pto('Wall 2', 348 - 110, -(1716.5 + 60)), pto('Wall 2', 348 + 30, -(1716.5 + 60)),
  pto('Wall 2', 4248 - 110, -(1913 + 60)), pto('Wall 2', 4248 + 30, -(1913 + 60)),
  txt('Wall 2', 48, 600, -1450, '2 x NEFF 60 OVENS stacked (B69FS5CY0A + B69VS73Y0A, Z912BDY0 120 kit), 500-1716.5'),
  txt('Wall 2', 666, 1000, -1850, 'POCKET DOORS - hardware TBC. Timbergrain inside'),
  txt('Wall 2', 666, 1000, -1500, 'MICROWAVE on fixed shelf 1550 AFF (model TBC)'),
  txt('Wall 2', 2224, 866, -1700, 'RANGEHOOD Falmec FP3MLD90S2 90 deep undermount, cut-out 824 x 330'),
  txt('Wall 2', 1684, 1946, -1490, 'LED STRIPLIGHT under the overheads'),
  txt('Wall 2', 3648, 600, -1100, 'INTEGRATED FRIDGE Liebherr IRBH5120, niche 1780. Momo Barra DBR 288 handle'),
  txt('Wall 2', 4248, 600, -1100, 'INTEGRATED FREEZER Liebherr SIFNH5128, niche 1780. Momo Barra DBR 288 handle'),
  // Wall 5 (Elev 4, island front, from the east end)
  txt('Wall 5', 0, 280, -500, 'CURVED TILED END (substrate) - TO DETAIL'),
  txt('Wall 5', 940, 250, -500, 'OIL & SPICE PULL-OUT'),
  txt('Wall 5', 1190, 600, -500, 'INTEGRATED D/W Bosch SMV6HCX03A, 2pac panel by RHK, 25 packer under'),
  txt('Wall 5', 2690, 450, -500, '2 BIN PULL-OUT'),
  // Wall 6 (Elev 7, side unit under the stair, from the south)
  txt('Wall 6', 30, 525, -1150, 'OPEN SHELF, Timbergrain inside'),
  txt('Wall 6', 30, 1050, -1360, 'TOP 1300 AFF - raw stair stringer 1320 AFF. Fronts flush with the 750 wall'),
  // Wall 7 (island seating side)
  txt('Wall 7', 0, 2542, -500, '18 SUBSTRATE BACK PANEL - TILED BY OTHERS. ~300 top overhang, 4 stools along 2700'),
]
for (const r of rows) if (r.view === 'elevation' && r.kind === 'text' && !r.text.startsWith('LED')) r.cad_layer_id = SITE_LAYER
chk('del', await sb.from('room_annotations').delete().eq('room_id', R))
chk('ins', await sb.from('room_annotations').insert(rows.map((r, i) => ({ ...r, sort_order: i + 1 }))))
console.log('annotations', rows.length)
