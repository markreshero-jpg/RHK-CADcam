// RHK6478 Bed 2 Robe: shadowline sits ON the overhead top line -> wall_cabinet_top 2352.5 (ceiling 2369 - 16.5)
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const r = await sb.from('rooms').update({ wall_cabinet_top: 2352.5 }).eq('id', '761f434a-cdc8-4cb8-b1dc-da69ae78f12a').select('wall_cabinet_top')
console.log(r.error?.message ?? JSON.stringify(r.data))
