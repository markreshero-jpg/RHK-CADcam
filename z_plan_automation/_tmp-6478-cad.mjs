// RHK6478 US Hallway Linen: spec block (plan, incl the 20 floor allowance) + PTO tags on the Wall 2 elevation.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'b6377e60-bed3-4e5c-af80-7ea320db6ff5'
const wall2 = (await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).data.id
await sb.from('room_annotations').delete().eq('room_id', R)
const spec = 'SPECIFICATIONS - {room}\n{job}\n\nFRONTS + PANELS\n{fronts}\n18mm 2pac - colour TBC\nKick 100: to match fronts\n\nHANDLES\nPush to open\n\nCARCASS\n{carcass}\n\nHARDWARE\nHinges: {hinges}\n\nSITE\nCeiling 2712 off slab, less 20 floor\nallowance (TBC) = 2692 finished\n18 shadowline to the ceiling'
const pto = x => ({ room_id: R, view: 'elevation', wall_id: wall2, wall_side: 'face', kind: 'text', geom: { at: { x, y: -1060 } }, text: 'PTO', style: { size: 2.5 } })
const { error } = await sb.from('room_annotations').insert([
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 1900, y: 0 }, width: 75 }, sort_order: 1, text: spec,
    style: { size: 2.5, bgPad: 2, block: 'Spec block', border: 'box', lineSpacing: 1.3, borderWeight: 0.35 } },
  { ...pto(362), sort_order: 2 }, { ...pto(617), sort_order: 3 }, { ...pto(1130), sort_order: 4 },
])
console.log(error?.message ?? 'ok')
