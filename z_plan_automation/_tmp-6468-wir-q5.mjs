import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'dfa682a3-020b-4704-8661-3dbbd6cdf224'
const c = (await sb.from('cabinet_instances').select('id,label').eq('room_id', R).eq('label', 'TC-01').single()).data
console.log(JSON.stringify((await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', c.id)).data, null, 1))
const g = (await sb.from('cabinet_custom_parts').select('name,orientation,expressions,material_role,no_cnc').ilike('name', '%mirror%').limit(3)); console.log(JSON.stringify(g))
const a = (await sb.from('room_annotations').select('id,text,kind,origin,user_edited_at').eq('room_id', R).or('text.ilike.%2700%,kind.eq.cloud')).data; console.log(a)
