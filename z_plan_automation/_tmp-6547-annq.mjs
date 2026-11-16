import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const r = await sb.from('room_annotations').select('id,view,kind,text,style,created_at,updated_at').eq('room_id', '20601f2b-4fa7-49c1-bfff-36d1d53ed308').order('sort_order')
for (const a of r.data ?? []) console.log(a.view, a.kind, a.style?.src ?? 'NO-SRC', (a.text ?? '').slice(0, 40).replace(/\n/g, ' | '), a.created_at, a.updated_at)
console.log(r.error ?? r.data.length)
process.exit(0)
