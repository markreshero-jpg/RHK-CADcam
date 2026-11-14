import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
// TEPK panels start at the kick height themselves: floor origin, dy incl the kick
const r = await sb.from('cabinet_instances').update({ pos_z: 0 }).eq('room_id', 'dfa682a3-020b-4704-8661-3dbbd6cdf224').in('label', ['TC-12', 'TC-13', 'TC-14', 'TC-15']); console.log(r.error ?? 'ok')
