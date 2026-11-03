import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data, error } = await sb.from('cabinet_definitions').select('*').limit(1)
console.log(error?.message, Object.keys(data?.[0] ?? {}).join(','))
const key = Object.keys(data[0]).find(k => /code/.test(k)) ?? 'name'
const { data: all } = await sb.from('cabinet_definitions').select(`id,name,${key},assembly_class`).or(`${key}.ilike.D1%,${key}.ilike.%ID%,${key}.ilike.%EP%,${key}.ilike.%FLSHLF%,${key}.ilike.VAN%`)
for (const d of all) console.log(d[key], '|', d.name, '|', d.assembly_class)
const { data: ds } = await sb.from('cabinet_definitions').select('name,assembly_class,default_dy').or('name.ilike.D%,name.ilike.%ID%,name.ilike.B1%,name.ilike.%VAN%').eq('active', true).order('name')
console.log(ds.map(d => d.name).join('  '))
