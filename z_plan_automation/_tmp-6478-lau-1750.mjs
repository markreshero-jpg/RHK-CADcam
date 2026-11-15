// RHK6478 Laundry (Mark 2026-11-16): washer/dryer opening 1750 high (was 1732) - TC-04 tower top cupboard underside 2150 -> 2168
// (dy 507 -> 489, top stays 2657); washer shelf WC-01 top stays 418. Note + red height dim follow.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc'
const chk = (w, r) => console.log(w, r.error?.message ?? 'ok')
chk('TC-04', await sb.from('cabinet_instances').update({ pos_z: 2168, dy: 489 }).eq('room_id', R).eq('label', 'TC-04'))
const { data: dim } = await sb.from('room_annotations').select('geom').eq('id', '253bb6c3-4679-431d-a488-0a566c588b7b').single()
chk('dim', await sb.from('room_annotations').update({ geom: { ...dim.geom, p2: { ...dim.geom.p2, y: -2168 } } }).eq('id', '253bb6c3-4679-431d-a488-0a566c588b7b'))
const { data: t } = await sb.from('room_annotations').select('text').eq('id', '7f1bb07f-0bd9-4d17-9522-0abe9890cb0b').single()
chk('note', await sb.from('room_annotations').update({ text: t.text.replace('632 x 1732 clear', '632 x 1750 clear') }).eq('id', '7f1bb07f-0bd9-4d17-9522-0abe9890cb0b'))
process.exit(0)
