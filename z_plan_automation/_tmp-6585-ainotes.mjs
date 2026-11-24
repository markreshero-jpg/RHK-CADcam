// RHK6585: append the 2026-11-24 drawing status to the project's ai_notes (keeps what's there).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const P = 'b34da912-850c-4695-86a7-f33138d09cd3'
const p = (await sb.from('projects').select('ai_notes').eq('id', P).single()).data
if (p.ai_notes.includes('DRAWN 24/11/2026')) { console.log('already noted'); process.exit(0) }
const add = ' DRAWN 24/11/2026 (draft, layouts in z_plan_automation/layouts/rhk6585-jojo-*.json): Media Unit, Pantry, Entry Bench Seat drawn with kicks joined, spec blocks + markup. Assumed, to check with Mark: 400 = overall depth (carcass 377, top 5 past doors); pantry base carcass 575; pantry corner = void corner with a 40 filler on each run (A drawers 764.5, B cupboards 712 + 711); plumbing opening at the RH end of Wall B; overheads 2 x 772 with 16.5 WF-L each side, 710 overall incl a 16.5 under panel set back 20, LED route in it; bench seat cabinet scribe 16.5 L + R; shelves / tops on generic PT Woodmatt 16mm (colour not chosen - resolver shows Boston Oak as the stand-in); bench seat ply top drawn as a 33 Oasis placeholder. Base runs tight to the RH walls (filler TBC). TO CONFIRM lists are on each elevation (Questions for Client layer).'
console.log((await sb.from('projects').update({ ai_notes: p.ai_notes + add }).eq('id', P)).error?.message ?? 'ai_notes updated')
process.exit(0)
