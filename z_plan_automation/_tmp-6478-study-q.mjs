import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9'
const { data } = await sb.from('cabinet_instances').select('*').eq('room_id', R).in('label', ['WC-13', 'WC-14'])
for (const c of data) console.log(c.label, JSON.stringify(c))
const ops = (await sb.from('part_operations').select('*').eq('source_cabinet_id', data.find(c => c.label === 'WC-14').id)).data
console.log(JSON.stringify(ops))
