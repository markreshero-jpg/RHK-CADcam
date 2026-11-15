import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data, error } = await sb.from('walls').select('*').in('id', ['a8f5b817-1b73-4fe7-8d8f-6ce5ba54ab2f', '49cac0f2-c25f-41af-8472-a4ef5290d891', '5ad932fd-050a-4f3b-ac76-b24abc450ead'])
console.log(error?.message, (data ?? []).map(w => [w.id.slice(0, 8), w.name ?? w.label, w.room_id?.slice(0, 8)]))
process.exit(0)
