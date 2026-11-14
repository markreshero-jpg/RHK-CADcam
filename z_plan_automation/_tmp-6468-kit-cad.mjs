// RHK6468 Kitchen CAD (2026-11-14): spec block + SITE NOTES, cavity slider TBC, void corners, appliance spaces.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '58bac32f-cdca-4a86-a1a4-c29af7ef9430'
const GENERAL = '2cef1c43-289a-4bad-b300-6de894984764', SITE = '9f56ed36-2b15-4e9f-b2c8-2bce522384b8'
const walls = Object.fromEntries((await sb.from('walls').select('id,name').eq('room_id', R)).data.map(w => [w.name, w.id]))
const ann = (await sb.from('room_annotations').select('id,text,sort_order').eq('room_id', R)).data
if (ann.some(a => a.text?.startsWith('SPECIFICATIONS'))) throw new Error('CAD already there')
let so = Math.max(0, ...ann.map(a => a.sort_order ?? 0))
const boxStyle = { src: 'markup-std', size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const note = { size: 2.5, align: 'center', border: 'box', bgPad: 1 }

const spec = [
  'SPECIFICATIONS - {room}', '{job}', '',
  'BENCHTOP', '20mm SNB Arabescato Marble honed (ST)', '',
  'FRONTS + PANELS', 'Veneer 17 American Oak, 10% clear lacquer, vertical grain', 'Gables 33 Veneer American Oak', 'Overheads marked 2PK on the plan - TBC', '',
  'HANDLES', 'TBC (grab rail / set back finger pull)', '',
  'DRAWERS', 'Nikpol Dragon Pro, soft close', '',
  'HARDWARE', 'Hinges: Blum soft close', 'Lift-ups: Blum Aventos HK x 6', '',
  'CARCASS', '16.5 Whiteboard, 1mm white PVC edges',
].join('\n')
const site = [
  'SITE NOTES',
  'Kick 120 (Liebherr ECBN8872 plinth 50-170)',
  'South wall 6089 wall to wall, less 2 x 12 gyprock',
  "Butler's north wall 3220 to the cavity slider - 120 gap left",
  'Kitchen run 3872: sink + bin stand in front of the cavity slider - fixing on site',
  'Ceiling 2400 - talls + overheads to 2370, 30 bulkhead',
  'Curved PB bulkhead + concealed rangehood by others',
].join('\n')

const el = (wall, x, y, w, text, layer = GENERAL) => ({ room_id: R, view: 'elevation', wall_id: walls[wall], wall_side: 'face', kind: 'text', cad_layer_id: layer, text, geom: { at: { x, y }, width: w }, style: note })
const rows = [
  { room_id: R, view: 'plan', kind: 'text', cad_layer_id: GENERAL, text: spec, geom: { at: { x: 6800, y: -2893 }, width: 90 }, style: { ...boxStyle, block: 'Spec block' } },
  { room_id: R, view: 'plan', kind: 'text', cad_layer_id: SITE, text: site, geom: { at: { x: 6800, y: 300 }, width: 90 }, style: { ...boxStyle } },
  { room_id: R, view: 'plan', kind: 'text', cad_layer_id: SITE, text: '120 GAP - CAVITY SLIDER TBC\n(review when the slider wall goes in)', geom: { at: { x: 2300, y: 700 }, width: 45 }, style: note },
  el('Wall 3', 30, -500, 29, 'VOID CORNER'),
  el('Wall 3', 2231, -500, 22, 'VOID CORNER'),
  el('Wall 2', 5516, -500, 26, 'VOID CORNER'),
  el('Wall 4', 30, -500, 26, 'VOID CORNER'),
  el('Wall 8', 343, -650, 27, 'WINE FRIDGE SPACE\nLiebherr UWKES1752\n600W x 900H'),
  el('Wall 2', 1269, -1700, 42, 'INTEGRATED FRIDGE\nLiebherr ECBN8872\nrecess 915W x 2052H\npanels to Liebherr guide\nkick with vent grille'),
  el('Wall 2', 4883, -700, 27, 'INTEGRATED DW\nMiele G7939 SCi XXL\nTBC', SITE),
  el('Wall 7', 1366, -700, 27, 'INTEGRATED DW\nMiele G7939 SCi XXL\nTBC', SITE),
  el('Wall 2', 2217, -1250, 27, 'WALL OVEN\nMiele H7464BP'),
  el('Wall 2', 2217, -1500, 27, 'COFFEE\nMiele CVA7440'),
  el('Wall 2', 2850, -1050, 27, 'COMBI STEAM\nMiele DGC7440'),
  el('Wall 2', 2850, -1500, 27, 'MICROWAVE\nMiele H7440BM'),
  el('Wall 2', 2217, -1700, 57, 'TOP OF OVENS 1578 vs OVERHEAD UNDERSIDE 1620 - TBC', SITE),
]
for (const row of rows) {
  const r = await sb.from('room_annotations').insert({ ...row, sort_order: ++so }).select('id').single()
  console.log(row.view, row.text.split('\n')[0], r.error?.message ?? r.data.id)
}
