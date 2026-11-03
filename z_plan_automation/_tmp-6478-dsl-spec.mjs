import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: a } = await sb.from('room_annotations').select('id,text').eq('room_id', 'f1953ab4-a03b-4439-a777-d39476156f31').like('text', 'SPECIFICATIONS%').single()
const t = a.text.replace('Gable bottoms edged', 'No bottom - open underneath\nGables + back edged on bottoms')
console.log(t, (await sb.from('room_annotations').update({ text: t }).eq('id', a.id)).error?.message ?? 'ok')
