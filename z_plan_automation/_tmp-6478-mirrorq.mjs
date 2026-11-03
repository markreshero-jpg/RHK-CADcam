import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: cols } = await sb.from('door_schedule_materials').select('*').eq('material_id', 'd081b2a1-38a8-472c-a415-f179699a1347')
console.log('colours on whiteboard', JSON.stringify(cols))
const { data: eb, error } = await sb.from('edge_banding').select('*').ilike('name', '%white%').limit(10)
console.log(error?.message, JSON.stringify(eb?.map(e => [e.id, e.name, e.thickness_mm ?? e.thickness, e.material_id ?? ''])))
const { data: se } = await sb.from('handle_schedule_entries').select('*').limit(3)
console.log(JSON.stringify(se))
const { data: hs } = await sb.from('handle_schedules').select('*').limit(3)
console.log(JSON.stringify(hs))
