// RHK6592: kitchen + butlers -> Shaker — 2pac (quote: shaker, 2pac satin). Same blank + colour range as 2 Pac Flat 18,
// so the job colour Classic White Satin stays. Bathrooms keep their room style (PT 16 flat).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const r = await sb.from('projects').update({ default_door_style_id: '2610ca59-80c5-4313-8fbe-7ee6456f5f38' }).eq('id', 'f801076c-4e6b-4214-b0b6-91e92c2dfa8c').select('default_door_style_id')
console.log(r.error?.message ?? r.data)
