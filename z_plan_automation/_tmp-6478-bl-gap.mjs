import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: c } = await sb.from('cabinet_instances').select('id,dy,pos_z,has_toekick,kick_run_id,rule_overrides').eq('room_id', 'f98db01e-14e2-454d-8c80-a48567bcc20e').eq('label', 'TC-01').single()
console.log(JSON.stringify(c))
// GAPC is the gap x 2 (resolveFace shares it between the two fronts): 6 = a 3mm gap between the doors (Mark).
console.log((await sb.from('cabinet_instances').update({ rule_overrides: { ...c.rule_overrides, GAPC: 6 } }).eq('id', c.id)).error?.message ?? 'GAPC 6 ok')
