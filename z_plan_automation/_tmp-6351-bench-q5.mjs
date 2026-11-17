import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ds = await sb.from('door_styles').select('id,name,door_material_schedule_id,door_catalogue_id').eq('door_material_schedule_id','9c04b651-e76f-4822-a2dd-e716d3e6bfac'); console.log('styles', JSON.stringify(ds.data ?? ds.error))
const pm = await sb.from('materials').select('*').eq('id','28a7be0d-479f-4ca0-8f92-e4b6c6093d51').single(); console.log(JSON.stringify(pm.data))
const d = await sb.from('door_schedule_materials').select('*').eq('id','fe78ff94-f9f2-41be-b999-5a5fb8e7b35f').single(); console.log(JSON.stringify(d.data))
const rm = await sb.from('room_materials').select('*').eq('room_id','ea8bf9e6-7086-4017-9b7a-5e4f6ecac996'); console.log('pantry rm', JSON.stringify(rm.data))
const rt = await sb.from('room_toekick_materials').select('*').limit(2); console.log('rtm', JSON.stringify(rt.data ?? rt.error))
