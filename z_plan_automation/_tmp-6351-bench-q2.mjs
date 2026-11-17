import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const m = await sb.from('materials').select('id,name,thickness_mm').ilike('name', '%tas%oak%'); console.log('materials', JSON.stringify(m.data ?? m.error))
const dsm = await sb.from('door_schedule_materials').select('*').ilike('name', '%tas%'); console.log('dsm', JSON.stringify(dsm.data ?? dsm.error))
const ds = await sb.from('door_styles').select('id,name').or('name.ilike.%PT%,name.ilike.%woodmatt%,name.ilike.%polytec%'); console.log('styles', JSON.stringify(ds.data ?? ds.error))
const dsj = await sb.from('door_styles').select('id,name').in('id', ['8ffd3162-6b06-4abf-9f00-e05caf04eb79','28d45d84-3270-40ad-ae78-7df696bcc388']); console.log('jobstyles', JSON.stringify(dsj.data))
const rooms = (await sb.from('rooms').select('*').eq('id', 'ea8bf9e6-7086-4017-9b7a-5e4f6ecac996').single()).data
console.log('roomcols', Object.keys(rooms).join(','))
const rm = await sb.from('room_materials').select('*').limit(3); console.log('room_materials sample', JSON.stringify(rm.data ?? rm.error))
