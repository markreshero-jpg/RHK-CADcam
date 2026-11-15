import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const P = 'fa0884a2-abd1-4370-adfa-a30044e88ef2'
const { data: rooms } = await sb.from('rooms').select('id,name').eq('project_id', P)
const { data } = await sb.from('room_annotations').select('*').in('room_id', rooms.map(r => r.id)).gte('created_at', '2026-11-12T14:00:00Z')
fs.writeFileSync(process.argv[2], JSON.stringify({ rooms, data }))
console.log(data.length, Object.keys(data[0]))
console.log(JSON.stringify(data.find(a => a.kind === 'line')).slice(0, 800))
process.exit(0)
