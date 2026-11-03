// Temp: pin Dragon Pro 400x95 Matt Grey on the study drawer BC-03 (500 desk leaves 413.5 depth).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ID = '0382bd6e-b755-4852-bf69-7dd0b62a2a6b'
const { data: c } = await sb.from('cabinet_instances').select('hardware_overrides').eq('id', ID).single()
const r = await sb.from('cabinet_instances').update({ hardware_overrides: { ...(c.hardware_overrides ?? {}), slide_id: '36fa4ea5-5e73-44d9-baa7-e8caf1ae44f9' } }).eq('id', ID).select('hardware_overrides')
console.log(r.error?.message ?? JSON.stringify(r.data))
