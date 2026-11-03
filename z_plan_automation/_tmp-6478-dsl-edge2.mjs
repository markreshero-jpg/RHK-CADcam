import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: p } = await sb.from('projects').select('*').eq('id', 'fa0884a2-abd1-4370-adfa-a30044e88ef2').single()
console.log(Object.entries(p).filter(([k]) => /method|rule/i.test(k)).map(([k, v]) => k + '=' + JSON.stringify(v).slice(0, 300)).join('\n'))
const { data: r } = await sb.from('rooms').select('*').eq('id', 'f1953ab4-a03b-4439-a777-d39476156f31').single()
console.log(Object.entries(r).filter(([k]) => /method|rule/i.test(k)).map(([k, v]) => k + '=' + JSON.stringify(v).slice(0, 300)).join('\n'))
const mid = r.construction_method_id ?? p.construction_method_id
const { data: m, error } = await sb.from('construction_methods').select('*').limit(20)
console.log(error?.message, (m ?? []).map(x => x.id + ' ' + x.name + ' default=' + x.is_default + ' EDGING=' + JSON.stringify(x.rules?.EDGING)).join('\n'))
console.log(Object.keys(m[0]).join(','))
console.log(JSON.stringify(Object.fromEntries(Object.entries(m[0]).filter(([k, v]) => JSON.stringify(v ?? '').includes('EDGING') || /edg/i.test(k)))).slice(0, 2000))
