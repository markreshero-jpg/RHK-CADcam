import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: m } = await sb.from('materials').select('*').ilike('name', '%white%').limit(20)
console.log(Object.keys(m?.[0]??{}).join(',')); for (const x of m ?? []) console.log(x.id, x.name, x.dz ?? x.thickness_mm ?? x.thickness)
const { data: h } = await sb.from('hardware_handles').select('*').limit(40)
console.log(Object.keys(h[0]).join(','))
for (const x of h) console.log(x.id, x.name, x.grip_kind, x.drill_pattern ?? '', x.length_mm ?? '', x.finish ?? '')
const { data: ds } = await sb.from('door_material_schedules').select('id,name,brand')
console.log(JSON.stringify(ds))
