// RHK6585 Pantry rev 1 (Mark 2026-11-24): keep the layout JSON + job ai_notes in step with the room.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const p = 'z_plan_automation/layouts/rhk6585-jojo-pantry.json', j = JSON.parse(fs.readFileSync(p, 'utf8'))
for (const c of j.cabinets) {
  if (c.wall === 1 && c.dz === 575) c.dz = 455
  if (c.def === 'BFKW' && c.wall === 4) Object.assign(c, { offset: 0, dx: 35 })
  if (c.def === 'B2D' && c.offset === 154) Object.assign(c, { offset: 35, dx: 771 })
  if (c.def === 'B2D' && c.offset === 866) Object.assign(c, { offset: 806, dx: 771 })
}
const note = 'REV 1 (Mark 2026-11-24): Wall A bases only 480 deep -> carcass 455 (480 overall, in line with the void front + shelves). A fronts now sit behind the void face, so the Wall B run starts at the void wall: BFKW 35 | B2D 771 | B2D 771. Wall A still stops 153 short of the void (40 filler) so the drawers clear the B cupboard. 20 stone tops drawn in the app (colour TBC, schedule "20mm Reconstituted Stone - Colour TBC"): Benchtop 1 Wall A 480 deep, Benchtop 2 Wall B 600 deep through the corner, butt joint (_tmp-6585-pantry-tops.mjs).'
if (!j._notes.some(n => n.startsWith('REV 1'))) j._notes.push(note)
fs.writeFileSync(p, JSON.stringify(j, null, 1) + '\n')
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const P = 'b34da912-850c-4695-86a7-f33138d09cd3', a = (await sb.from('projects').select('ai_notes').eq('id', P).single()).data.ai_notes
if (!a.includes('PANTRY REV 1')) console.log((await sb.from('projects').update({ ai_notes: a + ' PANTRY REV 1 (Mark 24/11/2026): 20mm stone top, colour TBC - drawn (2 tops, butt joint). Wall A base cabinets only 480 deep (drawn 480 overall, carcass 455); Wall B run now starts at the void wall with a 35 filler, cupboards 2 x 771.' }).eq('id', P)).error?.message ?? 'ai_notes updated')
process.exit(0)
