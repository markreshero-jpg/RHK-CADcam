import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const s = await sb.from('benchtop_schedules').select('*').eq('id', 'ca01b6c2-c3cc-4084-8905-5c45577fb58b')
console.log(JSON.stringify(s.data ?? s.error))
const p = await sb.from('benchtop_schedules').select('*').eq('project_id', '0e903bed-7a27-4278-a2b1-71e051e14290')
console.log(JSON.stringify(p.data ?? p.error))
const m = await sb.from('benchtop_build_methods').select('id,name').eq('id', 'fde097ae-d0e2-46dc-a549-9939ff7d8c28')
console.log(JSON.stringify(m.data ?? m.error))
const f = await sb.from('cabinet_definitions').select('id,name,default_dz,default_dy').eq('name', 'FLSHLF')
console.log(JSON.stringify(f.data))
process.exit(0)
