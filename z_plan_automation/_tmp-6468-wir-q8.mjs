import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const m = (await sb.from('materials').select('*').eq('id', 'fcfa8ede-490a-4dfc-bee9-42923d1e9c0f').single()).data
console.log(Object.fromEntries(Object.entries(m).filter(([k, v]) => v !== null && typeof v !== 'object')))
const r = await sb.from('materials').select('id,name,thickness_mm,dz').or('name.ilike.%classic white%,name.ilike.%33%,name.ilike.%32%').limit(40); console.log(r.error?.message, r.data)
