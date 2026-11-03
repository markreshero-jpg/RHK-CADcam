// Temp: print RHK6586 spec blocks (plan text starting SPECIFICATIONS).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: rooms } = await sb.from('rooms').select('id,name').eq('project_id', 'bada385f-41cf-411e-9536-d1e413e6d5ce')
for (const r of rooms) {
  const { data } = await sb.from('room_annotations').select('id,text').eq('room_id', r.id).ilike('text', 'SPECIFICATIONS%')
  for (const a of data) console.log('=====', r.name, a.id, '\n' + a.text)
}
