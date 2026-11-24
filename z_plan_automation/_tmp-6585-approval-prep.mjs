// RHK6585 before the approval PDF (Mark 2026-11-24): VJ panel seat top to ceiling; TO CONFIRM lists cut down to the questions
// for the client (Mark's own ones are answered). Own markup only, edited in place; an empty list is removed.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const P = 'b34da912-850c-4695-86a7-f33138d09cd3'
const PANTRY = '7b416272-2861-4bf8-a60f-94f5632aa439', ENTRY = 'e08d668d-d8b5-406a-bb2f-72671848b0a3'
const own = async R => chk('a', await sb.from('room_annotations').select('id,kind,text,style,wall_id').eq('room_id', R)).filter(a => a.style?.src === 'markup-std')
const put = async (row, text) => { if (row.text !== text) { chk('u', await sb.from('room_annotations').update({ text }).eq('id', row.id)); console.log('updated:', text.split('\n')[0], '/', text.split('\n')[1] ?? '') } }

// Entry Bench Seat
let rows = await own(ENTRY)
const vj = rows.find(a => a.text?.startsWith('VJ PANELLING'))
if (vj) await put(vj, 'VJ PANELLING - FULL WIDTH, SEAT TOP TO CEILING\nSUPPLIED RAW BY RHK (NO FITTING) - PAINTED BY OTHERS')
const site = rows.find(a => a.text?.startsWith('SITE NOTES'))
if (site) await put(site, site.text.replace('VJ panel full width (1700) on the wall above:', 'VJ panel full width (1700), seat top to ceiling (1900 at 2400 ceiling):'))
const tbcE = rows.filter(a => a.text?.startsWith('TO CONFIRM'))
if (tbcE.length) { chk('d', await sb.from('room_annotations').delete().in('id', tbcE.map(a => a.id))); console.log('bench seat TO CONFIRM removed (all answered)') }

// Pantry: client questions only.
rows = await own(PANTRY)
const walls = chk('w', await sb.from('walls').select('id,name').eq('room_id', PANTRY))
const wName = id => walls.find(w => w.id === id)?.name
for (const t of rows.filter(a => a.text?.startsWith('TO CONFIRM'))) {
  if (wName(t.wall_id) === 'Wall 4') await put(t, 'TO CONFIRM\n1. Stone benchtop colour\n2. Existing plumbing - what it is, its position and the size of opening needed')
  if (wName(t.wall_id) === 'Wall 1') await put(t, 'TO CONFIRM\n1. Woodmatt colour for the floating shelves\n2. Shelf heights - drawn 1400 / 1700 / 2050 to underside\n3. Skinny chopping board cupboard - shelf or no shelf')
}
const a = chk('p', await sb.from('projects').select('ai_notes').eq('id', P).single()).ai_notes
if (!a.includes('VJ panel seat top to ceiling')) chk('ai', await sb.from('projects').update({ ai_notes: a + ' Mark 24/11/2026: VJ panel seat top to ceiling (full width).' }).eq('id', P))
const p = 'z_plan_automation/layouts/rhk6585-jojo-entry-bench-seat.json', j = JSON.parse(fs.readFileSync(p, 'utf8'))
if (!j._notes.some(n => n.includes('seat top to ceiling'))) { j._notes.push('Mark 2026-11-24: VJ panel full width, seat top to ceiling.'); fs.writeFileSync(p, JSON.stringify(j, null, 1) + '\n') }
console.log('done'); process.exit(0)
