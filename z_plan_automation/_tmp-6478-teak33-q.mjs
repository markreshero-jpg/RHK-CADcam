import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: one } = await sb.from('materials').select('*').limit(1)
console.log(Object.keys(one[0]).join(','))
const { data } = await sb.from('materials').select('*').or('name.ilike.%teak%,name.ilike.%33%')
for (const m of data) console.log(m.id, '|', m.name, '|', m.thickness ?? m.thickness_mm, '|', m.finish ?? '', '|', m.brand ?? '', m.code ?? '', '|', m.material_type ?? m.type ?? '')
process.exit(0)
