// RHK6585 Pantry (Mark 2026-11-24): 20 stone tops, colour TBC - one per wall, butt joint at the corner. Wall 1 bases 480 deep.
// Also updates the room's own markup text in place.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '7b416272-2861-4bf8-a60f-94f5632aa439'
const METHOD = 'fde097ae-d0e2-46dc-a549-9939ff7d8c28'   // 20mm Stone
const SCHED = 'ca01b6c2-c3cc-4084-8905-5c45577fb58b'    // 20mm Reconstituted Stone – Colour TBC
const walls = chk('w', await sb.from('walls').select('id,name').eq('room_id', R))
const W = n => walls.find(w => w.name === n).id
const P = (x, y) => ({ x, y })
// edges: 'wall' | 'front' (exposed) | 'butt' (joint)
const top = (label, wall, pts, kinds) => {
  const segments = pts.map((p0, i) => ({ p0, p1: pts[(i + 1) % pts.length], type: 'line', edge: kinds[i] === 'wall' ? { wall: true } : kinds[i] === 'butt' ? { joint: 'butt' } : { wall: false } }))
  return { room_id: R, label, polygon: pts, segments, edge_tags: kinds.map((k, i) => k === 'wall' ? { type: 'wall', edge_index: i } : null).filter(Boolean),
    join_types: [], joins: [], arc_segments: [], cutout_polygons: [], wall_id: W(wall), wall_side: 'face', height_mm: 880,
    benchtop_build_method_id: METHOD, benchtop_schedule_id: SCHED, notes: '20mm stone, colour TBC' }
}
const have = chk('h', await sb.from('benchtop_instances').select('id,label').eq('room_id', R))
if (have.length) console.log('tops already in the room:', have.map(h => h.label).join(', '))
else {
  const rows = [
    // Wall A: 480 deep, open end (flush with the end panel) up to the void front. Butts into the Wall B top between 480 and 600.
    top('Benchtop 1', 'Wall 1', [P(0, 480), P(480, 480), P(480, 600), P(480, 1664), P(0, 1664)], ['wall', 'butt', 'front', 'front', 'wall']),
    // Wall B: 600 deep, void side wall to the RH wall, runs through the corner.
    top('Benchtop 2', 'Wall 4', [P(479, 0), P(2056, 0), P(2056, 600), P(480, 600), P(480, 480), P(479, 480)], ['wall', 'wall', 'front', 'butt', 'wall', 'wall']),
  ]
  console.log('tops inserted', chk('ins', await sb.from('benchtop_instances').insert(rows).select('label')).map(r => r.label).join(', '))
}

// Markup text, updated in place.
const mine = chk('a', await sb.from('room_annotations').select('id,text,style').eq('room_id', R)).filter(a => a.style?.src === 'markup-std' && a.text)
const edits = [
  ['BENCHTOP\n20mm - material TBC', 'BENCHTOP\n20mm stone - colour TBC'],
  ['Bench 900 high, 600 deep', 'Bench 900 high incl 20 stone: Wall A 480 deep, Wall B 600 deep'],
  ['1. Corner: 40 filler on each run, corner under the bench left empty (void corner)\n2. Benchtop material (20 allowed - not in the quote)', '1. Corner: Wall A run stops 153 short of the void with a 40 filler, 35 filler at the void wall on Wall B\n2. Stone colour'],
  ['4. Drawers 764 wide (corner filler + void corner at the void end)', '4. Drawers 764 wide (corner filler + void corner at the void end)\n5. Wall A bench 480 deep overall (carcass 455)'],
]
for (const [from, to] of edits) {
  const hit = mine.filter(a => a.text.includes(from))
  if (hit.length !== 1) { console.log('SKIP (', hit.length, 'rows):', from.slice(0, 40)); continue }
  chk('u', await sb.from('room_annotations').update({ text: hit[0].text.replace(from, to) }).eq('id', hit[0].id)); hit[0].text = hit[0].text.replace(from, to)
  console.log('updated:', to.split('\n')[0].slice(0, 60))
}
process.exit(0)
