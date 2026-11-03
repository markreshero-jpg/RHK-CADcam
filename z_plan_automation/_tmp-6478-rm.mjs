import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data } = await sb.from('room_materials').select('*').limit(4)
console.log(JSON.stringify(data))
const { data: f } = await sb.from('cabinet_definitions').select('name,default_dx,default_dy,default_dz,float_shelf,assembly_class').in('name', ['FLSHLF', 'TEPF', 'D2-LL'])
console.log(JSON.stringify(f))
