// RHK6478 US Broom: Push To Open room schedule, spec block, PTO tag, 150 robo vac dim + note, fillers 2 back from the wall note.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '02ce23c0-9b53-454f-8bcf-f0f81daa1dc8'
console.log('room PTO', (await sb.from('rooms').update({ handle_schedule_id: '9440a3f0-63db-4085-9042-1c728298b49a' }).eq('id', R)).error?.message ?? 'ok')
const wall2 = (await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).data.id
await sb.from('room_annotations').delete().eq('room_id', R)
const spec = 'SPECIFICATIONS - {room}\n{job}\n\nFRONTS + PANELS\n{fronts}\n18mm 2pac - colour TBC\nNo kick: whole cupboard + fillers\n150 off the floor (robo vac gap)\nFillers fitted 2mm back from the wall\n\nHANDLES\n{handles}\n\nCARCASS\n{carcass}\n700 overall incl door\nNo bottom - open underneath\nGables + back edged on bottoms\nAll shelves adjustable\n\nHARDWARE\nHinges: {hinges}\n\nSITE\n481 wide x 714 deep\nCeiling 2714 off slab, less 20 floor\nallowance (TBC) = 2694 finished\n18 shadowline to the ceiling'
const el = { room_id: R, view: 'elevation', wall_id: wall2, wall_side: 'face' }
const { error } = await sb.from('room_annotations').insert([
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 900, y: 0 }, width: 75 }, sort_order: 1, text: spec,
    style: { size: 2.5, bgPad: 2, block: 'Spec block', border: 'box', lineSpacing: 1.3, borderWeight: 0.35 } },
  { ...el, kind: 'text', geom: { at: { x: 45, y: -1420 } }, text: 'PTO', style: { size: 2.5 }, sort_order: 2 },
  { ...el, kind: 'dim', geom: { p1: { x: 481, y: 0 }, p2: { x: 481, y: -150 }, offset: 100, axis: 'y' }, style: {}, sort_order: 3 },
  { ...el, kind: 'text', geom: { at: { x: 650, y: -330 }, width: 40, leader: [{ x: 240, y: -75 }, { x: 620, y: -290 }] }, text: '150 GAP FOR ROBO VAC', style: { size: 2.5 }, sort_order: 4 },
  { ...el, kind: 'text', geom: { at: { x: 650, y: -1650 }, width: 55, leader: [{ x: 466, y: -1500 }, { x: 620, y: -1610 }] }, text: 'FIT FILLERS 2mm BACK FROM WALL', style: { size: 2.5 }, sort_order: 5 },
])
console.log('cad', error?.message ?? 'ok')
