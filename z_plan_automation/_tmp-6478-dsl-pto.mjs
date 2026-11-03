// DS Linen: door hinged right, room handle schedule Push To Open, PTO note at the left (non-hinged) edge on the Wall 2 elevation.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'f1953ab4-a03b-4439-a777-d39476156f31'
console.log('room PTO', (await sb.from('rooms').update({ handle_schedule_id: '9440a3f0-63db-4085-9042-1c728298b49a' }).eq('id', R)).error?.message ?? 'ok')
const { data: c } = await sb.from('cabinet_instances').select('id,face_grid').eq('room_id', R).eq('label', 'TC-02').single()
c.face_grid.zones = c.face_grid.zones.map(z => z.face_type === 'door' ? { ...z, hinge_side: 'right' } : z)
console.log('hinge right', (await sb.from('cabinet_instances').update({ face_grid: c.face_grid }).eq('id', c.id)).error?.message ?? 'ok')
const wall2 = (await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).data.id
await sb.from('room_annotations').delete().eq('room_id', R).eq('text', 'PTO')
console.log('PTO note', (await sb.from('room_annotations').insert({ room_id: R, view: 'elevation', wall_id: wall2, wall_side: 'face', kind: 'text', geom: { at: { x: 45, y: -1100 } }, text: 'PTO', style: { size: 2.5 }, sort_order: 8 })).error?.message ?? 'ok')
