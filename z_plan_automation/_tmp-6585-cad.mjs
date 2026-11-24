// RHK6585 Jojo: CAD markup standard for the 3 drawn rooms - spec block, SITE NOTES, colour callouts, TO CONFIRM list + clouds, LED note.
// Redo removes only its own untouched rows (style.src markup-std, origin auto, never edited by Mark).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const P = 'b34da912-850c-4695-86a7-f33138d09cd3'
const MEDIA = 'e0e96be3-7615-413c-b4f8-2a07c728ec39', PANTRY = '7b416272-2861-4bf8-a60f-94f5632aa439', ENTRY = 'e08d668d-d8b5-406a-bb2f-72671848b0a3'

let layers = chk('l', await sb.from('job_cad_layers').select('id,name').eq('project_id', P))
if (!layers.find(l => l.name === 'Questions for Client'))
  chk('layer', await sb.from('job_cad_layers').insert({ project_id: P, name: 'Questions for Client', color: '#0891b2', visible: true, print: true, is_default: false, sort_order: 6 }))
layers = chk('l', await sb.from('job_cad_layers').select('id,name').eq('project_id', P))
const L = n => layers.find(x => x.name === n).id
const G = L('General'), S = L('Site notes'), Q = L('Questions for Client'), E = L('Electrical')

const T = { size: 2.5, align: 'center', src: 'markup-std' }, cloud = { src: 'markup-std', weight: 0.25, cloudBump: 4 }
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35, src: 'markup-std' }
const pts = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
const inCab = (left, w, y) => ({ at: { x: left + 30, y }, width: (w - 60) / 20 })
const lines = t => t.split('\n').length

async function room(R, build) {
  const all = chk('a', await sb.from('room_annotations').select('id,style').eq('room_id', R))
  const mine = all.filter(a => a.style?.src === 'markup-std')   // the DB trigger still refuses rows Mark has edited
  console.log(R, 'existing CAD', all.length, 'own untouched', mine.length)
  if (all.length !== mine.length) console.log('  NOTE: room has other CAD (Mark or edited) - left alone')
  if (mine.length) chk('del', await sb.from('room_annotations').delete().in('id', mine.map(r => r.id)))
  const walls = chk('w', await sb.from('walls').select('id,name').eq('room_id', R))
  const W = n => walls.find(w => w.name === n).id
  const elev = wall => (layer, kind, geom, text, style = T) => ({ room_id: R, view: 'elevation', wall_id: W(wall), wall_side: 'face', cad_layer_id: layer, kind, geom, text, style })
  const plan = (layer, kind, geom, text, style = T) => ({ room_id: R, view: 'plan', cad_layer_id: layer, kind, geom, text, style })
  // Spec block + SITE NOTES stacked on the plan at outer wall face + 600.
  const blocks = (x, spec, site) => [
    plan(G, 'text', { at: { x, y: -400 }, width: 75 }, spec, { ...box, block: 'Spec block' }),
    plan(S, 'text', { at: { x, y: -400 + lines(spec) * 65 + 250 }, width: 75 }, site, box),
  ]
  const rows = build({ elev, plan, blocks })
  chk('ins', await sb.from('room_annotations').insert(rows.map((r, i) => ({ ...r, sort_order: i + 1 }))))
  console.log('  inserted', rows.length)
}

// ── Media Unit (Wall 2 = 3963, unit 663 -> 3963) ──
await room(MEDIA, ({ elev, blocks }) => {
  const e = elev('Wall 2')
  return [
    ...blocks(4653, `SPECIFICATIONS - {room}
{job}

BENCHTOP + FLOATING SHELVES
33mm Polytec Woodmatt - colour TBC
(option: ply with clear lacquer)

FRONTS + PANELS
Polytec Classic White Matt

HANDLES
Set back square edge finger pull - TBC

CARCASS
16mm Whiteboard

HARDWARE
Hinges: Blum soft close`, `SITE NOTES
Site measure 29.10.26: wall 3963, ceiling 2561
Bulkhead 2305 FFL at the LH end
Unit 3300 overall, hard against the RH wall
TV zone 1364 - 2594 (1230 wide)
Top 400 deep, shelves 300 deep
Shelves fixed to the RH wall; LH free ends hang off a metal support rod to the ceiling (if do-able)
Side walls not measured (drawn 2000)`),
    e(S, 'text', inCab(0, 663, -2480), 'BULKHEAD 2305 FFL (EXISTING)'),
    e(S, 'text', inCab(0, 663, -1650), 'METAL SUPPORT ROD TO CEILING AT THE FREE END OF THE SHELVES (IF DO-ABLE)'),
    e(G, 'text', inCab(1369, 1230, -1500), 'TV BY OWNER\nTV ZONE 1230 WIDE'),
    e(G, 'text', inCab(1369, 1230, -780), 'TOP + FLOATING SHELVES\n33 PT WOODMATT - COLOUR TBC'),
    e(Q, 'cloud', { pts: pts(640, -960, 1400, -1880) }, null, cloud),
    e(Q, 'cloud', { pts: pts(3760, -110, 3990, -590) }, null, cloud),
    e(Q, 'text', { at: { x: 4143, y: -2400 }, width: 45 }, `TO CONFIRM
1. Woodmatt colour (or ply + clear lacquer)
2. Shelf heights - drawn 1000 / 1400 / 1800 / 2200 to underside
3. Unit height 600 (100 kick + 467 + 33 top)
4. Filler at RH wall - board thickness or 30?
5. Handles - set back finger pull?
6. Top 400 deep overall, 5 past the doors`, { ...box, align: 'left' }),
  ]
})

// ── Pantry (Wall 1 = A 1184, Wall 4 = B 1577) ──
await room(PANTRY, ({ elev, plan, blocks }) => {
  const a = elev('Wall 1'), b = elev('Wall 4')
  return [
    ...blocks(2746, `SPECIFICATIONS - {room}
{job}

BENCHTOP
20mm - material TBC

FRONTS + PANELS - BASE
Polytec Classic White Matt

FRONTS + PANELS - OVERHEADS
Polytec Black Matt

FLOATING SHELVES
33mm Polytec Woodmatt - colour TBC

HANDLES
Base: set back square edge finger pull
Overheads: no handle, doors drop past the under panel

CARCASS
16mm Whiteboard

DRAWERS
Nikpol Dragon Pro - white, soft close

HARDWARE
Hinges: Blum soft close

OVERHEADS
700 above benchtop to underside`, `SITE NOTES
Site measure 29.10.26: ceiling 2583
Wall A 1184, Wall B 1577, RH wall 768, overall 2055
Corner box 479 x 480 = existing plasterboard void (duct) - build around it
Bench 900 high, 600 deep
Overheads 350 deep x 710 high, underside 1600
Floating shelves 480 deep, undersides 1400 / 1700 / 2050
Green tile splashback by others`),
    plan(G, 'text', { at: { x: 40, y: 500 }, width: 22 }, 'VOID CORNER'),
    a(G, 'text', inCab(0, 1184, -1080), 'GREEN TILE SPLASHBACK BY OTHERS'),
    a(G, 'text', inCab(0, 1184, -1290), 'FLOATING SHELVES 33 PT WOODMATT - COLOUR TBC'),
    b(G, 'text', inCab(0, 1577, -1250), 'GREEN TILE SPLASHBACK BY OTHERS'),
    b(E, 'text', inCab(0, 1577, -1540), 'LED STRIP RECESSED IN THE UNDER PANEL - ROUTE 18.5 x 9, 60 BACK FROM ITS FRONT EDGE (CONNECTION + SWITCHING BY OTHERS)'),
    b(Q, 'cloud', { pts: pts(1180, -120, 1560, -440) }, null, cloud),
    b(Q, 'text', inCab(866, 711, -800), 'EXISTING PLUMBING THIS END - OPENING / CUT-OUT TBC'),
    b(Q, 'text', { at: { x: 1757, y: -2400 }, width: 45 }, `TO CONFIRM
1. Corner: 40 filler on each run, corner under the bench left empty (void corner)
2. Benchtop material (20 allowed - not in the quote)
3. Existing plumbing - position + size of the opening
4. Filler at RH wall (base) - board thickness or 30?
5. Overheads 710 overall incl under panel; "20 shadow" = doors drop / panel set back 20?`, { ...box, align: 'left' }),
    a(Q, 'text', { at: { x: 1364, y: -2400 }, width: 45 }, `TO CONFIRM
1. Woodmatt colour for the shelves
2. Shelf heights - drawn 1400 / 1700 / 2050 to underside
3. Skinny cupboard - shelf or no shelf, hinge side
4. Drawers 764 wide (corner filler + void corner at the void end)`, { ...box, align: 'left' }),
  ]
})

// ── Entry Bench Seat (Wall 2 = 1700) ──
await room(ENTRY, ({ elev, blocks }) => {
  const e = elev('Wall 2')
  return [
    ...blocks(2390, `SPECIFICATIONS - {room}
{job}

BENCHTOP
Plywood - thickness TBC

FRONTS + PANELS
Polytec Oasis Smooth

HANDLES
20mm finger gap, set back square edge finger pull

CARCASS
16mm Whiteboard

HARDWARE
Hinges: Blum soft close`, `SITE NOTES
Site measure 29.10.26: 1700 wall to wall, 400 deep
Seat 500 high incl 100 kick + top
Cabinet scribe 16.5 left + right - scribe to the walls on site
Ceiling height NOT measured (2400 drawn) - check on site
VJ panel for the wall above: supplied raw by RHK, no fitting, painted by others`),
    e(G, 'text', inCab(0, 1700, -1500), 'VJ PANELLING TO THE WALL ABOVE\nSUPPLIED RAW BY RHK (NO FITTING) - PAINTED BY OTHERS'),
    e(G, 'text', inCab(0, 1700, -720), 'FLAP-DOWN DOORS, 20 FINGER GAP - PT OASIS SMOOTH\nPLY BENCH SEAT TOP'),
    e(Q, 'cloud', { pts: pts(200, -1750, 1500, -2050) }, null, cloud),
    e(Q, 'text', inCab(200, 1300, -1950), 'HAT HOOKS (CLIENT SKETCH) - BY WHOM? TBC'),
    e(Q, 'text', { at: { x: 1880, y: -2300 }, width: 45 }, `TO CONFIRM
1. Ply top - thickness + finish (drawn 33)
2. Doors - 2 flap-down doors drawn; sketch shows 2 rows of shoe drawers
3. Hat hooks - who supplies / fits
4. VJ panel - height + extent
5. Ceiling height (not measured)`, { ...box, align: 'left' }),
  ]
})
process.exit(0)
