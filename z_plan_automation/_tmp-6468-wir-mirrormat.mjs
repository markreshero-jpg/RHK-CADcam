// RHK6468 WIR: the Mirror (by others) part followed the frame's exposed board -> pin it to Mirror 4mm.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const MIRROR = '8870b896-fcc0-4928-9b81-dd9a849c97c6'
const r = await sb.from('cabinet_custom_parts').update({ material_override_id: MIRROR, material_id: MIRROR }).eq('id', 'd6b68843-c10a-4e97-af00-eabb4c864c4c').select('id,material_id,material_override_id,no_cnc')
console.log(r.error ?? r.data)
