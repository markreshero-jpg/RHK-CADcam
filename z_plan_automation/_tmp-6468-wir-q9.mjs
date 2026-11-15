import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const r = await sb.from('materials').select('id,name,dz,parent_id,sheet_dx').gte('dz', 30).lte('dz', 34); console.log(r.error?.message, r.data)
const p = await sb.from('materials').select('id,name,dz').eq('id', '377c999c-18fa-4318-ba3d-93f858a1d652'); console.log(p.data)
