// RHK6478 Study: Wall 3 elevation notes (glass desk top, LED, file drawers, shaped leg).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9', W3 = 'c8ae2218-1d3b-4ed6-be41-40f116019340'
const el = { room_id: R, view: 'elevation', wall_id: W3, wall_side: 'face', kind: 'text' }
chk('del', await sb.from('room_annotations').delete().eq('room_id', R).eq('view', 'elevation'))
chk('ins', await sb.from('room_annotations').insert([
  { ...el, sort_order: 1, style: { size: 2.5 }, geom: { at: { x: 2000, y: -1150 }, width: 70, leader: [{ x: 2200, y: -752 }, { x: 2150, y: -1080 }] },
    text: '6mm TOUGHENED GLASS DESK TOP (supplied by RHK) - see into the drawers. 2 pieces, joint over BC-08 left gable. Front overhangs ~10. 100 wide timber grain back strip at the wall. Top 750 AFF' },
  { ...el, sort_order: 2, style: { size: 2.5 }, geom: { at: { x: 400, y: -1420 }, width: 60, leader: [{ x: 600, y: -1500 }, { x: 560, y: -1440 }] },
    text: 'COB LED RECESSED IN UNDER PANELS - ROUTE 18.5 x 9, 60 BACK FROM FRONT' },
  { ...el, sort_order: 3, style: { size: 2.5, align: 'center' }, geom: { at: { x: 1286, y: -620 }, width: 22 }, text: 'FILE DRAWERS' },
  { ...el, sort_order: 4, style: { size: 2.5 }, geom: { at: { x: 3080, y: -500 }, width: 45, leader: [{ x: 3014, y: -400 }, { x: 3075, y: -460 }] },
    text: 'SHAPED LEG 16.5 Teak: 595 top, 45 deg into R200, 200 at floor' },
]))
console.log('ok')
