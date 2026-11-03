// RHK6478 DS Linen: spec block (plan) + tundish rectangle, dims and note on the Wall 2 elevation (y down from the floor).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'f1953ab4-a03b-4439-a777-d39476156f31'
const wall2 = (await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).data.id
await sb.from('room_annotations').delete().eq('room_id', R)
const spec = 'SPECIFICATIONS - {room}\n{job}\n\nFRONTS + PANELS\n{fronts}\n18mm 2pac - colour TBC\nNo kick: door 150 off the floor\n\nHANDLES\n{handles}\n\nCARCASS\n{carcass}\nNo bottom (robot vacuum drives in)\nGable bottoms edged\nAll shelves adjustable\n\nHARDWARE\nHinges: {hinges}\n\nSITE\nCeiling 2419 off slab, less 20 floor\nallowance (TBC) = 2399 finished\n18 shadowline to the ceiling\nTundish 1652-1722 H, 45-180 in (TBC)'
const el = { room_id: R, view: 'elevation', wall_id: wall2, wall_side: 'face' }
const { error } = await sb.from('room_annotations').insert([
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 900, y: 0 }, width: 75 }, sort_order: 1, text: spec,
    style: { size: 2.5, bgPad: 2, block: 'Spec block', border: 'box', lineSpacing: 1.3, borderWeight: 0.35 } },
  { ...el, kind: 'rect', geom: { a: { x: 45, y: -1722 }, b: { x: 180, y: -1652 } }, style: { dash: 'dashed' }, sort_order: 2 },
  { ...el, kind: 'dim', geom: { p1: { x: 0, y: -1722 }, p2: { x: 45, y: -1722 }, offset: -150, axis: 'x' }, style: {}, sort_order: 3 },
  { ...el, kind: 'dim', geom: { p1: { x: 45, y: -1722 }, p2: { x: 180, y: -1722 }, offset: -150, axis: 'x' }, style: {}, sort_order: 4 },
  { ...el, kind: 'dim', geom: { p1: { x: 180, y: 0 }, p2: { x: 180, y: -1652 }, offset: 120, axis: 'y' }, style: {}, sort_order: 5 },
  { ...el, kind: 'dim', geom: { p1: { x: 180, y: -1652 }, p2: { x: 180, y: -1722 }, offset: 120, axis: 'y' }, style: {}, sort_order: 6 },
  { ...el, kind: 'text', geom: { at: { x: 60, y: -2330 }, width: 18 }, text: 'TUNDISH - keep visible. Cut-out in back TBC', style: { size: 2.5, align: 'center' }, sort_order: 7 },
])
console.log(error?.message ?? 'ok')
