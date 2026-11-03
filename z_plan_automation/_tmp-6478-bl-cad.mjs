// RHK6478 Bath Linen: spec block + elevation notes (mirror doors, lip pulls, 3 shadowlines / final measure after tiling).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'f98db01e-14e2-454d-8c80-a48567bcc20e'
const wall2 = (await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).data.id
await sb.from('room_annotations').delete().eq('room_id', R)
const spec = 'SPECIFICATIONS - {room}\n{job}\n\nFRONTS\nMirror doors: 16mm Whiteboard + 4mm\nmirror cut to size, stuck on face\n3mm gap between the doors\nNo fillers: 3mm shadowline each wall,\ndoors flush with the carcass sides\nKick 100: Lx Sublime Teak Chalk (to match\nthe US Bath vanity drawer fronts)\n\nHANDLES\nSmall brushed nickel lip pull 50mm\non the meeting edges, 1000 off the floor\n\nCARCASS\n{carcass}\n4 shelves equally spaced, 2nd up fixed\nSplit in height at the fixed shelf\n\nHARDWARE\nHinges: {hinges} - 5 per door (mirror weight)\n\nSITE\n1036 wide x 602 deep - FINAL MEASURE\nafter tiling (width will change)\nCeiling 2400 (TBC), 18 shadowline'
const el = { room_id: R, view: 'elevation', wall_id: wall2, wall_side: 'face' }
const { error } = await sb.from('room_annotations').insert([
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 1400, y: 0 }, width: 75 }, sort_order: 1, text: spec,
    style: { size: 2.5, bgPad: 2, block: 'Spec block', border: 'box', lineSpacing: 1.3, borderWeight: 0.35 } },
  { ...el, kind: 'text', geom: { at: { x: 1200, y: -2200 }, width: 60, leader: [{ x: 780, y: -2000 }, { x: 1170, y: -2160 }] }, text: 'MIRROR DOORS - 16mm Whiteboard + 4mm mirror cut to size, stuck on face', style: { size: 2.5 }, sort_order: 2 },
  { ...el, kind: 'text', geom: { at: { x: 1200, y: -1130 }, width: 60, leader: [{ x: 518, y: -1000 }, { x: 1170, y: -1090 }] }, text: 'LIP PULLS - small brushed nickel 50mm, 3mm gap between doors, 1000 off the floor', style: { size: 2.5 }, sort_order: 3 },
  { ...el, kind: 'text', geom: { at: { x: 1200, y: -400 }, width: 60, leader: [{ x: 1034, y: -300 }, { x: 1170, y: -360 }] }, text: '3mm SHADOWLINE each wall - FINAL MEASURE after tiling', style: { size: 2.5 }, sort_order: 4 },
])
console.log(error?.message ?? 'ok')
