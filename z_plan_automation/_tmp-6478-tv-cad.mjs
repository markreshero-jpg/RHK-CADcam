// RHK6478 DS TV Unit CAD (rev 3: 235 drawer fronts, bench 898, TV 1300, one row of 459 record cubes, 16.5 board): opening dims (small text) + bay notes on the Wall 4 elevation (the square island
// line the unit hangs off), spec block + site notes on the plan. Elevation coords: x along Wall 4, y = -AFF.
// Openings from internal_parts: upper boxes stand on the 33 bench at 793 (no bottom), top panel 2672-2690.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = '46c02367-c556-489e-9907-67785eb2cd87', SITE_LAYER = '2931a12f-666e-4f16-9840-8a8b4e09da50'
const w4 = chk('wall', await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 4').single()).id
const el = { room_id: R, view: 'elevation', wall_id: w4, wall_side: 'face' }
const DIM = { size: 1.8, weight: 0.18 }, NOTE = { size: 2, align: 'center' }
const rows = []
const hdim = (x1, x2, aff) => rows.push({ ...el, kind: 'dim', geom: { p1: { x: x1, y: -aff }, p2: { x: x2, y: -aff }, offset: 0, axis: 'x' }, style: DIM })
const vchain = (x, spans) => { for (const [a, b] of spans) rows.push({ ...el, kind: 'dim', geom: { p1: { x, y: -a }, p2: { x, y: -b }, offset: 0, axis: 'y' }, style: DIM }) }
const note = (left, width, aff, text) => rows.push({ ...el, kind: 'text', geom: { at: { x: left + 30, y: -aff }, width: (width - 60) / 20 }, text, style: NOTE })

// Opening spans AFF (bottom, top) and internal widths along Wall 4.
const LOWB = [898, 1398], MIDB = [1414.5, 2198], TOPR = [2214.5, 2673.5], TV = [898, 2198]
const L = [36.5, 526.5], C = [559.5, 2618.5], C6 = [2651.5, 3149.8], C7 = [3166.3, 3664.6]
const CUBE = +((C[1] - C[0] - 3 * 16.5) / 4).toFixed(1)

hdim(...L, 2500); hdim(C[0], C[0] + CUBE, 2500); hdim(...C6, 2500); hdim(...C7, 2500); hdim(...C, 1000)
vchain(L[0] + 60, [LOWB, MIDB, TOPR]); vchain(C[1] - 60, [TV, TOPR]); vchain(C6[0] + 60, [LOWB, MIDB, TOPR]); vchain(C7[0] + 60, [LOWB, MIDB, TOPR])
vchain(C[0] + 60, [[100, 865]])   // drawer carcass height

note(C[0], C[1] - C[0], 1650, `TV OPENING\n${C[1] - C[0]}W x ${TV[1] - TV[0]}H\nTV 1725 x 1000`)
note(L[0] + 40, 440, 1150, 'SPEAKER')
note(L[0] + 40, 440, 1850, '2 ADJ SHELVES')
note(C6[0] + 40, 440, 1150, 'TURNTABLE')
note(C6[0] + 40, 440, 1850, 'RECORDS')
note(C7[0] + 40, 440, 1150, 'SPEAKER')
note(C7[0] + 40, 440, 1850, '2 ADJ SHELVES')
note(C[0], C[1] - C[0], 2420, 'RECORD CUBES - 459 CLEAR (TOP ROW)')
note(C[0] + 120, 1900, 560, '3 DRAWERS PER BANK - 235 FRONTS\nBOX 178 = 160 INSIDE')
note(2635, 1046, 520, 'OPEN - STEREO\n700 DEEP')

const BOX = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
rows.push({ room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 3701 + 700, y: 0 }, width: 80 }, style: { ...BOX, block: 'Spec block' },
  text: 'SPECIFICATIONS - {room}\n{job}\n\nBENCHTOP\n33mm LX Board Sublime Teak\n\nFRONTS + PANELS\nLX Colour 16mm Sublime Teak\nKick 100: to match fronts\n\nHANDLES\nSharknose\n\nCARCASS\n16mm Whiteboard (drawer units)\n\nOPEN SHELVES\nLX Colour 16mm Sublime Teak\ninside, shelves + backs' })
rows.push({ room_id: R, view: 'plan', kind: 'text', cad_layer_id: SITE_LAYER, geom: { at: { x: 3701 + 700, y: 1400 }, width: 80 }, style: BOX,
  text: 'SITE NOTES\nTV wall 3736 F/P along the wall, returns 445 / 1134, CH 2720 (site measure 22.10.26)\nTV wall 7.89 deg off square (architecturals sheet 30) = 3701 square between returns, ~513 run-out\nStraight front square to the room, 418 off the left inside corner (445 return). Stereo bays 700 deep. Void behind the units - CHECK ON SITE\n30 BH 2690-2720 for scribing to the ceiling' })

chk('del', await sb.from('room_annotations').delete().eq('room_id', R))
chk('ins', await sb.from('room_annotations').insert(rows.map((r, i) => ({ ...r, sort_order: i + 1 }))))
console.log('annotations', rows.length)
