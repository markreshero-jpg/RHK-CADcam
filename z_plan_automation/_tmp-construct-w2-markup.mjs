// Construct Building / Loose Parts: apply Mark's Wall 2 markup (2026-11-08) - updates only, no deletes.
//  walls 2400 -> 1900 high (both walls + room), Wall 2 2400 -> 2450 long,
//  TC-01 cover -> 2 pac Resene Alabaster (Satin Board 18mm), TC-02 strip edged all 4 sides (X on each edge).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); console.log(w, 'ok', r.data?.length ?? ''); return r.data }
const ROOM = '773dd73b-74d6-4f0d-8710-eb9db0e0372f', W2 = 'b7e02351-b025-4297-9945-947df9054947'
const SATIN18 = 'b07a7e40-facd-4cdf-8856-60712e940b44'
chk('walls h', await sb.from('walls').update({ height: 1900 }).eq('room_id', ROOM).select('id'))
chk('room h', await sb.from('rooms').update({ room_dy: 1900 }).eq('id', ROOM).select('id'))
chk('w2 len', await sb.from('walls').update({ length: 2450 }).eq('id', W2).select('id'))
chk('tc01 part', await sb.from('cabinet_custom_parts').update({ name: 'Cover 587 x 550, 2 pac Resene Alabaster (loose)', material_id: SATIN18, material_override_id: SATIN18, dz: 18 }).eq('id', 'be85c717-e1c4-4ada-9a49-339b2a37f5c4').select('id'))
chk('tc01 cab', await sb.from('cabinet_instances').update({ notes: 'LOOSE: Cover 587 x 550, 2 pac Resene Alabaster 18 (loose)', dz: 18 }).eq('id', '2b5b70ef-d1d8-44cc-b379-0fd9fd4e5e44').select('id'))
chk('tc02 part', await sb.from('cabinet_custom_parts').update({ name: 'Cover strip 430 x 60, white edge all 4 sides (loose)', edge_top: true, edge_bottom: true, edge_left: true, edge_right: true }).eq('id', '102bf0d4-8fcd-43bb-bdb2-430acfbf7b06').select('id'))
chk('tc02 cab', await sb.from('cabinet_instances').update({ notes: 'LOOSE: Cover strip 430 x 60, white edge all 4 sides (loose)' }).eq('id', '89bbda13-9041-4f2f-a1bb-f1f76abbe75d').select('id'))
const w = chk('check walls', await sb.from('walls').select('name,length,height').eq('room_id', ROOM))
console.log(JSON.stringify(w))
