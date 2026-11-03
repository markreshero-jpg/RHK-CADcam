// RHK6478 Bath Linen (Mark 2026-11-01): lip pulls 1000 AFF, kick face = US Bath vanity fronts (Lx Sublime Teak), height split at the fixed shelf.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'f98db01e-14e2-454d-8c80-a48567bcc20e'
const { data: c } = await sb.from('cabinet_instances').select('id,face_grid,dy').eq('room_id', R).eq('label', 'TC-01').single()
// Door runs 100 -> 2382 AFF; a tall door's grip edge is its top, so 1000 AFF = 2382 - 1000 from the top edge.
const fg = { ...c.face_grid, zones: c.face_grid.zones.map(z => z.face_type === 'door' ? { ...z, handle_offset: c.dy - 1000 } : z) }
// Fixed shelf underside Y 1006.2 (cabinet frame, kick included) -> top 1022.7; the shop cuts 3 below = 1019.7.
console.log('cab', (await sb.from('cabinet_instances').update({ face_grid: fg, split: { at: [1019.7] } }).eq('id', c.id)).error?.message ?? 'ok')
await sb.from('room_toekick_materials').delete().eq('room_id', R).eq('part_role', 'face')
console.log('kick face', (await sb.from('room_toekick_materials').insert({ room_id: R, part_role: 'face', material_id: '67ecbeff-98ac-41e1-9b1a-618a5bf6a96b' })).error?.message ?? 'ok')
