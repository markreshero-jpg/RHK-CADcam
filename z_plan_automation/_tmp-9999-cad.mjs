// RHK9999: spec block (plan) + stone panel note (elevation, Wall 2).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '8940d72a-1a10-4c86-a8f0-927863d3d563'
const wall2 = (await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).data.id
await sb.from('room_annotations').delete().eq('room_id', R)
const { error } = await sb.from('room_annotations').insert([
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 6200, y: 0 }, width: 75 }, sort_order: 1,
    text: 'SPECIFICATIONS - {room}\n{job}\n\nBENCHTOP\n{benchtop}\n20 stone + 100 mitred apron, 900 high\nStone panels 100 thick, butt under the top (by stonemason)\n\nFRONTS + PANELS\n{fronts}\nPanels: {panels}\nKick: to match fronts\n\nHANDLES\nFinger pulls\n\nCARCASS\n{carcass}\n\nHARDWARE\nHinges: {hinges}\nRunners: {runners}',
    style: { size: 2.5, bgPad: 2, block: 'Spec block', border: 'box', lineSpacing: 1.3, borderWeight: 0.35 } },
  { room_id: R, view: 'elevation', wall_id: wall2, wall_side: 'face', kind: 'text', sort_order: 2,
    geom: { at: { x: 1585, y: -1150 } }, text: 'STONE PANELS # 9, # 11, # 13, # 15 - 100 THICK, BY STONEMASON (NOT CNC)', style: { size: 2.5 } },
])
console.log(error?.message ?? 'ok')
