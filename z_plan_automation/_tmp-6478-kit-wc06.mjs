// RHK6478 Kitchen: WC-06 (cupboard over the ovens, 955.5) - 2 hinges per door, the middle one sat on the shelf holes.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: c } = await sb.from('cabinet_instances').select('id,face_grid').eq('room_id', 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6').eq('label', 'WC-06').single()
const fg = structuredClone(c.face_grid); fg.zones = fg.zones.map(z => ({ ...z, hinges: [855, 100] }))
const u = await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id); if (u.error) throw u.error
console.log('WC-06 hinges [855, 100]')
