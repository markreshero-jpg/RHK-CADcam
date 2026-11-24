// RHK6585 Pantry rev 2: remove the BEPF seen end at the open end of Wall 1 (now against the new return wall) - replaced by a BFK.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '7b416272-2861-4bf8-a60f-94f5632aa439'
const c = (await sb.from('cabinet_instances').select('id,label,dx,dz').eq('room_id', R).eq('label', 'BC-01').single()).data
if (!c || Number(c.dx) !== 16.5 || Number(c.dz) !== 455) throw new Error('BC-01 not the BEPF expected: ' + JSON.stringify(c))
const r = await sb.from('cabinet_instances').delete().eq('id', c.id)
console.log('deleted BEPF BC-01', r.error?.message ?? 'ok')
process.exit(0)
