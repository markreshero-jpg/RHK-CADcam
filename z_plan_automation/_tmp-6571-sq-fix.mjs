import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const r = (await sb.from('room_annotations').select('id,text').eq('room_id', '5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3').like('text', 'SITE QUESTIONS%')).data[0]
const t = r.text.replace('7. Fridge space 669 W (drawn) - fridge model + size, height clear under WC-09?', '7. Fridge space 669 W (drawn) - fridge model + size, door swing clear of the WF end?')
const u = await sb.from('room_annotations').update({ text: t }).eq('id', r.id); console.log(u.error ?? 'ok', t.includes('door swing'))
