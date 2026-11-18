import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const rooms = (await sb.from('rooms').select('id,name').eq('project_id', 'cf31069b-1a56-49ee-91df-dade35f68fde')).data
const a = (await sb.from('room_annotations').select('id,room_id,view,text').in('room_id', rooms.map(r => r.id)).ilike('text', '%blackbutt%')).data
for (const x of a) for (const line of x.text.split('\n').filter(l => /blackbutt/i.test(l))) console.log(rooms.find(r => r.id === x.room_id).name.padEnd(28), x.view.padEnd(9), x.id.slice(0, 8), '|', line)
const c = (await sb.from('cabinet_instances').select('label,room_id,notes').in('room_id', rooms.map(r => r.id)).ilike('notes', '%blackbutt%')).data
for (const x of c) console.log('NOTE', rooms.find(r => r.id === x.room_id).name, x.label, '|', x.notes)
const b = (await sb.from('benchtop_instances').select('label,room_id,notes').in('room_id', rooms.map(r => r.id))).data
for (const x of b) console.log('TOP', rooms.find(r => r.id === x.room_id).name, x.label, '|', (x.notes ?? '').slice(0, 80))
