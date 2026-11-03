import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: c } = await sb.from('cabinet_instances').select('id,rule_overrides').eq('room_id', 'f1953ab4-a03b-4439-a777-d39476156f31').eq('label', 'TC-02').single()
const ro = { ...(c.rule_overrides ?? {}), EDGING: { left_side: ['right', 'bottom'], right_side: ['right', 'bottom'] } }
const { error } = await sb.from('cabinet_instances').update({ rule_overrides: ro }).eq('id', c.id)
console.log(JSON.stringify(ro), error?.message ?? 'ok')
