// RHK6478: spec block text in every room (to match the WIP to the job's 2pac wording)
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: room } = await sb.from('rooms').select('project_id').eq('id', 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae').single()
const { data: rooms } = await sb.from('rooms').select('id,name').eq('project_id', room.project_id)
const { data: anns } = await sb.from('room_annotations').select('room_id,text,style').in('room_id', rooms.map(r => r.id)).eq('kind', 'text').ilike('text', 'SPECIFICATIONS%')
for (const a of anns) console.log('---', rooms.find(r => r.id === a.room_id).name, '\n' + a.text)
process.exit(0)
