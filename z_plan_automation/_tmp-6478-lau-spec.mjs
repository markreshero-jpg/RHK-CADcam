// RHK6478 Laundry: spec block 2pac colour TBC -> 25W (pass 'go'); list overhead front colours.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc'
const { data: anns } = await sb.from('room_annotations').select('id,kind,text').eq('room_id', R).ilike('text', '%TBC%')
for (const a of anns) console.log(a.id.slice(0, 8), JSON.stringify(a.text))
const room = null
const { data: cabs } = await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('assembly_class', 'wall').order('label')
for (const c of cabs) { const s = JSON.stringify(c); console.log(c.label, c.dx + 'x' + c.dy, s.includes('5fdb0fa7') ? 'TEAK-colour' : '', s.includes('67ecbeff') ? 'teak-board' : '', s.includes('8fae4f9c') ? 'teak33' : '', s.includes('747d491f') ? '25W' : '', (c.notes ?? '').slice(0, 60)) }
if (process.argv[2] === 'go') for (const a of anns) {
  const t = a.text.replace(/2 ?Pac - colour TBC/gi, '2 Pac - Dulux White Beach Quarter (25W)')
  if (t !== a.text) console.log('upd', (await sb.from('room_annotations').update({ text: t }).eq('id', a.id)).error?.message ?? 'ok', JSON.stringify(t))
}
process.exit(0)
