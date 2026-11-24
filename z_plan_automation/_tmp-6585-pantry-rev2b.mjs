// RHK6585 Pantry rev 2: Benchtop 1 open end -> wall edge (return wall), markup text in place, layout JSON + ai_notes in step.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '7b416272-2861-4bf8-a60f-94f5632aa439', P = 'b34da912-850c-4695-86a7-f33138d09cd3'
const bt = chk('b', await sb.from('benchtop_instances').select('id,segments,edge_tags').eq('room_id', R).eq('label', 'Benchtop 1').single())
const seg = bt.segments.map((s, i) => (s.p0.y === 1664 && s.p1.y === 1664) ? { ...s, edge: { wall: true } } : s)
const idx = seg.findIndex(s => s.p0.y === 1664 && s.p1.y === 1664)
const tags = bt.edge_tags.some(t => t.edge_index === idx) ? bt.edge_tags : [...bt.edge_tags, { type: 'wall', edge_index: idx }]
chk('bt', await sb.from('benchtop_instances').update({ segments: seg, edge_tags: tags }).eq('id', bt.id)); console.log('Benchtop 1 edge', idx, '-> wall')

const mine = chk('a', await sb.from('room_annotations').select('id,text,style').eq('room_id', R)).filter(a => a.style?.src === 'markup-std' && a.text)
const edits = [
  ['Wall A 1184, Wall B 1577, RH wall 768, overall 2055', 'Wall A 1184, Wall B 1577, RH wall 768, overall 2055\nReturn wall at the open end of Wall A, out to line up with the RH wall'],
]
for (const [from, to] of edits) {
  const hit = mine.filter(a => a.text.includes(from) && !a.text.includes('Return wall'))
  if (hit.length !== 1) { console.log('SKIP (', hit.length, 'rows):', from.slice(0, 40)); continue }
  chk('u', await sb.from('room_annotations').update({ text: hit[0].text.replace(from, to) }).eq('id', hit[0].id)); console.log('site notes updated')
}

const p = 'z_plan_automation/layouts/rhk6585-jojo-pantry.json', j = JSON.parse(fs.readFileSync(p, 'utf8'))
if (!j.walls.some(w => w._?.startsWith('6 '))) j.walls.push({ x: 2056, y: 1664, length: 2056, angle: 180, _: '6 return wall (rev 2) - inserted directly' })
const bepf = j.cabinets.find(c => c.def === 'BEPF'); if (bepf) Object.assign(bepf, { def: 'BFK', note: 'Pantry board-thickness filler at the return wall, open end of Wall A' })
for (const c of j.cabinets) {
  if (c.def === 'WF-L') c.dz = 350
  if (c.def === 'FLSHLF' && c.wall === 1) c.set.float_shelf.seen_left = false
}
const note = 'REV 2 (Mark 2026-11-24): L wall fillers 350 deep, flush with the overhead door faces. Return wall (Wall 6) off the open end of Wall A, out to the RH wall line, so the room squares off; the opening is between it and the end of the 768 RH wall. Wall A end panel -> BFK 16.5 at the new wall (kick stretched under it), floating shelves no longer seen at that end, Benchtop 1 end now a wall edge.'
if (!j._notes.some(n => n.startsWith('REV 2'))) j._notes.push(note)
fs.writeFileSync(p, JSON.stringify(j, null, 1) + '\n')
const a = chk('p', await sb.from('projects').select('ai_notes').eq('id', P).single()).ai_notes
if (!a.includes('PANTRY REV 2')) chk('ai', await sb.from('projects').update({ ai_notes: a + ' PANTRY REV 2 (Mark 24/11/2026): overhead L fillers flush with the door faces (350); return wall off Wall A out to the RH wall line (room squared off) - Wall A end panel now a 16.5 BFK, shelves + top not seen at that end.' }).eq('id', P))
console.log('layout + ai_notes done'); process.exit(0)
