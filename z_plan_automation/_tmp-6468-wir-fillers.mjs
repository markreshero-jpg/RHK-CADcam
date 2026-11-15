// RHK6468 WIR (Mark 2026-11-15): TC-05 / TC-08 40 fillers had their own kick on top of pos_z 120 -> sat a kick too high.
// The run kicks (BC-06 / BC-09) already run under them, so the fillers' own kick is turned off.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const r = await sb.from('cabinet_instances').update({ has_toekick: false, pos_z: 120 }).eq('room_id', 'dfa682a3-020b-4704-8661-3dbbd6cdf224').in('label', ['TC-05', 'TC-08']).select('label,has_toekick,pos_z,dy')
console.log(r.error ?? r.data)
