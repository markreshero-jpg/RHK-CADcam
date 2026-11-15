import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
for (const t of ['materials', 'part_library']) { const r = await sb.from(t).select('id,name').ilike('name', '%mirror%').limit(8); console.log(t, r.error?.message, r.data) }
const r = await sb.from('room_annotations').select('id,text,kind,origin,user_edited_at').eq('room_id', 'dfa682a3-020b-4704-8661-3dbbd6cdf224').in('kind', ['cloud']); console.log(r.error?.message, r.data)
const r2 = await sb.from('room_annotations').select('id,text,origin,user_edited_at').eq('room_id', 'dfa682a3-020b-4704-8661-3dbbd6cdf224').ilike('text', '%2700%'); console.log(r2.error?.message, r2.data)
