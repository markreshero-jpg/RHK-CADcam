import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: c } = await sb.from('door_schedule_materials').select('id,colour_name,finish,schedule_id,material_id,edgeband_id').or('colour_name.ilike.%teak%,colour_name.ilike.%subline%')
console.log('colours', JSON.stringify(c))
const { data: m } = await sb.from('materials').select('id,name,dz,parent_id,colour_name').or('name.ilike.%teak%,colour_name.ilike.%teak%')
console.log('materials', JSON.stringify(m))
const { data: k } = await sb.from('room_toekick_materials').select('*').limit(2)
console.log('rtk sample', JSON.stringify(k))
const { data: jk } = await sb.from('job_toekick_materials').select('*').eq('project_id', 'fa0884a2-abd1-4370-adfa-a30044e88ef2')
console.log('job tk', JSON.stringify(jk))
