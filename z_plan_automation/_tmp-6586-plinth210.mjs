// Temp: RHK6586 vanity onto a 210 plinth — everything +10 (cabinets, top, basin, plinth box) + LED note.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'a321bb6a-1ed6-428b-bcca-6d1946d16345'
const chk = (l, r) => console.log(l, r.error ? 'ERR ' + r.error.message : 'ok ' + (r.data?.length ?? ''))
chk('cabs', await sb.from('cabinet_instances').update({ pos_z: 210 }).eq('room_id', R).eq('pos_z', 200).select('label'))
chk('top', await sb.from('benchtop_instances').update({ height_mm: 775, notes: 'Vanity 60 finished: 20mm stone (colour TBC) + 60 mitred apron on the front + seen right end, 2100 x 500, top at 795 AFFL (basin rim 860) on the 210 tiled plinth. Semi-inset basin centred at 1050, wall spout 1050 AFFL.' }).eq('id', '3ae51258-db56-4450-935c-3794ac99c7a7').eq('height_mm', 765).select('id'))
chk('basin', await sb.from('room_fixtures').update({ z: 680 }).eq('id', '5193a04e-d9bc-4d5a-aef2-4fc5f763faed').eq('z', 670).select('id'))
chk('plinth', await sb.from('room_fixtures').update({ height: 210, name: 'Tiled plinth 210H (builder)', display_name: 'Tiled plinth 210H (builder)' }).eq('id', '8093d827-40e5-4b6f-b160-90bfb6d21b98').select('id'))
chk('led note', await sb.from('room_annotations').update({ text: 'LED SURFACE MOUNTED UNDERSIDE AT FRONT - BLACK' }).eq('id', '86e2d919-73dc-4650-ae31-cfbce8e9dda9').select('id'))
