// RHK6592 rev 16 (Mark 2026-11-05): main bath TC-02 hinge 2 down off the 916 shelf hole.  HINGE2=<mm> node ...
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: tc, error } = await sb.from('cabinet_instances').select('id,face_grid').eq('room_id', '6980f63e-923d-4ea8-ae57-a604eb4fa00e').eq('label', 'TC-02').single()
if (error) throw error
const fg = tc.face_grid
console.log('before', JSON.stringify(fg.zones.map(z => z.hinges)))
fg.zones = fg.zones.map(z => z.face_type === 'door' && Array.isArray(z.hinges) ? { ...z, hinges: z.hinges.map((h, i) => i === 1 ? Number(process.env.HINGE2) : h) } : z)
const r = await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', tc.id)
if (r.error) throw r.error
console.log('after', JSON.stringify(fg.zones.map(z => z.hinges)))
