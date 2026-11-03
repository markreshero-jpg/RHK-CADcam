// RHK6478 Laundry: washer / dryer opening dims on the Wall 2 elevation - 1732 high (18 top at 418 -> TC-04 underside 2150), 620 clear.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc'
const { data: w } = await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()
const el = { room_id: R, view: 'elevation', wall_id: w.id, wall_side: 'face' }
const TAG = 'WASHER / DRYER OPENING'
await sb.from('room_annotations').delete().eq('wall_id', w.id).eq('kind', 'text').like('text', TAG + '%')
const { data: old } = await sb.from('room_annotations').select('id,geom').eq('wall_id', w.id).eq('kind', 'dim')
for (const d of old ?? []) if ([418, 1700].includes(-d.geom?.p1?.y) && [48, 548].includes(d.geom?.p1?.x)) await sb.from('room_annotations').delete().eq('id', d.id)
const { error } = await sb.from('room_annotations').insert([
  { ...el, kind: 'dim', geom: { p1: { x: 548, y: -418 }, p2: { x: 548, y: -2150 }, offset: 0, axis: 'y' }, style: {}, sort_order: 20 },
  { ...el, kind: 'dim', geom: { p1: { x: 48, y: -1700 }, p2: { x: 668, y: -1700 }, offset: 0, axis: 'x' }, style: {}, sort_order: 21 },
  { ...el, kind: 'text', geom: { at: { x: 78, y: -1500 }, width: 22 }, text: `${TAG}\n620 x 1732 clear\nASKO washer +\ndryer stacked\n2 x 850 H`, style: { size: 2.5, align: 'center' }, sort_order: 22 },
])
console.log(error?.message ?? 'ok')
