// RHK6595: island top (Benchtop 1) was anchored to Wall 5 (stub wall) -> Wall 6 (island) so it shows on the island elevations.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const r = await sb.from('benchtop_instances').update({ wall_id: 'a74ea87c-7876-436e-8bb8-2a88fceaffca' }).eq('id', '47761820-0942-4a85-a0bf-71835a9f0353').select('label,wall_id,wall_side')
console.log(r.error?.message ?? JSON.stringify(r.data))
