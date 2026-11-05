// RHK6592 rev 14 (Mark 2026-11-05): bathroom vanity kick faces match the room doors (PT Colour Matt 16mm – Classic White
// Matt, same 16.5 as the whiteboard they replace), was Whiteboard 16.5. Spec block kick line updated.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (m, r) => { if (r.error) throw new Error(m + ': ' + r.error.message); console.log('ok', m); return r.data }
const PT = 'fcfa8ede-490a-4dfc-bee9-42923d1e9c0f'
for (const room of ['6980f63e-923d-4ea8-ae57-a604eb4fa00e', '8160a0cd-80aa-42e3-9b00-723db14b0747']) {
  chk('kick face ' + room.slice(0, 4), await sb.from('room_toekick_materials').update({ material_id: PT }).eq('room_id', room).eq('part_role', 'face'))
  for (const s of chk('spec', await sb.from('room_annotations').select('id,text').eq('room_id', room).like('text', 'SPECIFICATIONS%')))
    chk('spec text', await sb.from('room_annotations').update({ text: s.text.replace(/Kick 140: 16\.5 whiteboard/i, 'Kick 140: PT 16mm Classic White Matt (to match doors)') }).eq('id', s.id))
}
