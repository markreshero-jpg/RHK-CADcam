// RHK6595: both kitchen tops -> 20mm Stone schedule (plan: YDL Stone Kalana Bianco 20mm). Only the schedule changes.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const r = await sb.from('benchtop_instances').update({ benchtop_schedule_id: 'da288276-4dfc-4410-b6f6-d53d1b38c8fd' })
  .in('id', ['47761820-0942-4a85-a0bf-71835a9f0353', '71df84bb-d8a8-4974-b57a-2bb5a1a13196']).is('benchtop_schedule_id', null).select('label')
console.log(r.error?.message ?? JSON.stringify(r.data))
