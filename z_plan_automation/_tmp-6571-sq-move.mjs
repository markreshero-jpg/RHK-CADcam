// RHK6571: plan blocks re-spaced for a 1:25 plan page (text is paper-sized, so it's bigger in model mm at 1:25):
// spec block y 0, appliance block y 2050; SITE NOTES + SITE QUESTIONS in the clear space right of El C.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
for (const [id, at, width] of [
  ['5eb158bd-9a0f-4b36-bee1-4d19302c932d', { x: 6330, y: 2050 }],   // appliances
  ['0c85e031-51c7-428e-a8ed-d9353d7361c5', { x: 4150, y: 1600 }],   // site notes
  ['5eafff53-f20a-4e19-b5e8-2a063a29f95f', { x: 4230, y: 2450 }, 76],   // site questions
]) {
  const g = (await sb.from('room_annotations').select('geom').eq('id', id).single()).data.geom
  const u = await sb.from('room_annotations').update({ geom: { ...g, at, ...(width ? { width } : {}) } }).eq('id', id)
  console.log(id.slice(0, 8), u.error?.message ?? 'moved')
}
