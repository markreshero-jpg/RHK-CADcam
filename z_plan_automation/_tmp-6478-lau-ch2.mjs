// RHK6478 Laundry fix-up of _tmp-6478-lau-ch.mjs: Wall 4 runs right-to-left (angle 180), so the talls run is fixed at the
// nib (x 832) and the 2 comes off the free end at the 829 opening: Wall 4 starts at x 2654 (was 2656), length 2892;
// TC-09 back against the nib (pos_x 860, spans 832-860).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc'
const chk = (w, r) => console.log(w, r.error?.message ?? 'ok')
chk('wall 4', await sb.from('walls').update({ pos_x: 2654, length: 2892 }).eq('id', 'ecb5f211-100b-4ff8-98a3-dbb672e46b91').eq('pos_x', 2656))
chk('TC-09', await sb.from('cabinet_instances').update({ pos_x: 860 }).eq('room_id', R).eq('label', 'TC-09'))
process.exit(0)
