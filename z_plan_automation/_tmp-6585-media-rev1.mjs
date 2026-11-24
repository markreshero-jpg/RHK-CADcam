// RHK6585 Media Unit rev 1 (Mark 2026-11-24): height / depth / shelf heights fine; BFK at the RH wall; Woodmatt colour stays TBC
// (no ply option on the drawing); handles = set back finger pull, same as the pantry. Overall shelf lengths dimensioned on plan + elevation.
// Own markup only: text edited in place, resolved clouds removed, dims added (style.src markup-std, tag 'shelf-dims').
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = 'e0e96be3-7615-413c-b4f8-2a07c728ec39', P = 'b34da912-850c-4695-86a7-f33138d09cd3'
const G = chk('l', await sb.from('job_cad_layers').select('id').eq('project_id', P).eq('name', 'General').single()).id
const W2 = chk('w', await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).id
const rows = chk('a', await sb.from('room_annotations').select('id,kind,text,style,geom').eq('room_id', R))
const mine = rows.filter(a => a.style?.src === 'markup-std')

// 1. Text in place.
const edits = [
  ['33mm Polytec Woodmatt - colour TBC\n(option: ply with clear lacquer)', '33mm Polytec Woodmatt - colour TBC'],
  ['Set back square edge finger pull - TBC', 'Set back square edge finger pull'],
  ['Unit 3300 overall, hard against the RH wall\n', 'Unit 3300 overall, hard against the RH wall (16.5 filler)\n'],
]
for (const [from, to] of edits) {
  const hit = mine.filter(a => a.text?.includes(from))
  if (hit.length !== 1) { console.log('SKIP (', hit.length, 'rows):', from.slice(0, 40)); continue }
  chk('u', await sb.from('room_annotations').update({ text: hit[0].text.replace(from, to) }).eq('id', hit[0].id)); hit[0].text = hit[0].text.replace(from, to)
  console.log('updated:', to.split('\n')[0])
}
const tbc = mine.filter(a => a.text?.startsWith('TO CONFIRM'))
if (tbc.length === 1) { chk('t', await sb.from('room_annotations').update({ text: 'TO CONFIRM\n1. Woodmatt colour - top + floating shelves' }).eq('id', tbc[0].id)); console.log('TO CONFIRM -> Woodmatt colour only') }
// Move the TOP + FLOATING SHELVES note up, clear of the dim over the top.
const topNote = mine.find(a => a.text?.startsWith('TOP + FLOATING SHELVES'))
if (topNote && topNote.geom.at.y > -1020) chk('g', await sb.from('room_annotations').update({ geom: { ...topNote.geom, at: { ...topNote.geom.at, y: -1020 } } }).eq('id', topNote.id))

// 2. Resolved clouds (shelf heights, RH wall filler) out - automation's own rows only.
const clouds = mine.filter(a => a.kind === 'cloud')
if (clouds.length) { chk('dc', await sb.from('room_annotations').delete().in('id', clouds.map(c => c.id))); console.log('removed clouds', clouds.length) }

// 3. Shelf length dims (redo = replace our own tagged dims).
const old = mine.filter(a => a.style?.tag === 'shelf-dims')
if (old.length) chk('dd', await sb.from('room_annotations').delete().in('id', old.map(a => a.id)))
const DIM = { size: 2.5, weight: 0.18, arrowEnd: 'closed_open', arrowSize: 1.5, arrowStart: 'closed_open', src: 'markup-std', tag: 'shelf-dims' }
const dim = (view, x1, y1, x2, offset) => ({ room_id: R, view, cad_layer_id: G, kind: 'dim', text: null, style: DIM,
  geom: { p1: { x: x1, y: y1 }, p2: { x: x2, y: y1 }, axis: 'x', offset }, ...(view === 'elevation' ? { wall_id: W2, wall_side: 'face' } : {}) })
const L0 = 663, L1 = 663 + 706, R0 = 3963 - 1364, R1 = 3963
const add = [
  // Plan (room mm, y down; shelves 300 deep, top 400): row of the side shelves, then the overall.
  dim('plan', L0, 300, L1, 250), dim('plan', R0, 300, R1, 250), dim('plan', L0, 400, R1, 400),
  // Elevation Wall 2 (y = -height): top shelf 3300, the 1800 pair (706 / 1364), the 3300 top on the bases.
  dim('elevation', L0, -2233, R1, -110), dim('elevation', L0, -1833, L1, -110), dim('elevation', R0, -1833, R1, -110),
  dim('elevation', L0, -600, R1, -110),
]
chk('ins', await sb.from('room_annotations').insert(add.map((r, i) => ({ ...r, sort_order: 100 + i }))))
console.log('dims added', add.length)

// 4. Cabinet notes: drop "height TBC" / ply wording.
for (const c of chk('c', await sb.from('cabinet_instances').select('id,notes').eq('room_id', R).not('notes', 'is', null))) {
  const n = c.notes.replace(' (height TBC)', '').replace(' (height TBC; must stay under the 2305 bulkhead at the left)', ' (under the 2305 bulkhead at the left)').replace('; option ply + clear lacquer', '')
  if (n !== c.notes) chk('n', await sb.from('cabinet_instances').update({ notes: n }).eq('id', c.id))
}

// 5. Layout JSON + job notes in step.
const p = 'z_plan_automation/layouts/rhk6585-jojo-media-unit.json', j = JSON.parse(fs.readFileSync(p, 'utf8'))
if (!j.cabinets.some(c => c.def === 'BFK')) {
  const bs = j.cabinets.filter(c => c.def === 'B2D')
  ;[[679.5, 817], [1496.5, 817], [2313.5, 817], [3130.5, 816]].forEach(([o, dx], i) => Object.assign(bs[i], { offset: o, dx }))
  j.cabinets.splice(5, 0, { def: 'BFK', wall: 2, offset: 3946.5, dx: 16.5, dy: 567, dz: 377, note: 'Media unit board-thickness filler at the RH wall' })
  j._notes.push('REV 1 (Mark 2026-11-24): height 600, depth (top 400 / carcass 377), shelf heights all fine. BFK 16.5 at the RH wall, bases re-spaced 817 / 817 / 817 / 816 inside the same 3300. Woodmatt colour stays TBC, ply option dropped from the drawing. Handles = set back finger pull (same as the pantry). Shelf lengths dimensioned on plan + elevation (_tmp-6585-media-rev1.mjs).')
  fs.writeFileSync(p, JSON.stringify(j, null, 1) + '\n')
}
const a = chk('p', await sb.from('projects').select('ai_notes').eq('id', P).single()).ai_notes
if (!a.includes('MEDIA REV 1')) chk('ai', await sb.from('projects').update({ ai_notes: a + ' MEDIA REV 1 (Mark 24/11/2026): 600 high, 400 top / 377 carcass, shelf heights 1000/1400/1800/2200 all confirmed; BFK filler at the RH wall; Woodmatt colour TBC (do not mention the ply option); handles = set back finger pull, same as the pantry.' }).eq('id', P))
console.log('layout + ai_notes done'); process.exit(0)
