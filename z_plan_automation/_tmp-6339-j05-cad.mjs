// RHK6339 J05 (Mark 2026-11-11): spec block + SITE NOTES on the plan, BC-03 column note on the Wall 1 elevation.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'ab417075-b6e2-4189-93c5-c281e1f05f9b', WALL1 = '863581fd-8134-41c0-aded-c1440f85c1a3'
const GENERAL = '9768e64f-5133-4558-8375-b293405b976c', SITE = '82e5b80d-e0b7-4480-a64a-46af8e0b4d41'
const ann = (await sb.from('room_annotations').select('id,text,sort_order').eq('room_id', R)).data
if (ann.some(a => a.text?.startsWith('SPECIFICATIONS'))) throw new Error('spec block already there')
let so = Math.max(0, ...ann.map(a => a.sort_order ?? 0))
const boxStyle = { src: 'markup-std', size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }

const spec = [
  'SPECIFICATIONS - {room}', '{job}', '',
  'BENCHTOP', '35mm Solid Timber Blackbutt - clear matt lacquer', '',
  'FRONTS + PANELS', 'Veneer Blackbutt, vertical grain', 'Kick: Veneer Blackbutt, vertical grain (2 pieces)', '',
  'HANDLES', 'Sharknose finger pull', '',
  'CARCASS', 'PT Black Matt',
].join('\n')
const site = [
  'SITE NOTES',
  'Back wall 2830 (site measure)',
  'Top 914 off finished floor: 928 raw floor to underside of W16 less 14 timber floor - TBC',
  '716 wall to portal column, 1x gyprock still to go on',
  'Cupboard runs 100 behind the portal column - to check with builder',
].join('\n')

// Wall 2 at x 2830 + 90 thick -> outer face 2920; blocks at +30 paper mm (x20) = 3520.
const rows = [
  { room_id: R, view: 'plan', kind: 'text', cad_layer_id: GENERAL, text: spec,
    geom: { at: { x: 3550, y: -400 }, width: 80 }, style: { ...boxStyle, block: 'Spec block' } },
  { room_id: R, view: 'plan', kind: 'text', cad_layer_id: SITE, text: site,
    geom: { at: { x: 3550, y: 1300 }, width: 80 }, style: { ...boxStyle } },
  // Inside BC-03 (2037.5-2830): x = left + 30, width = (792.5 - 60) / 20; y = -(height AFF).
  { room_id: R, view: 'elevation', wall_id: WALL1, wall_side: 'face', kind: 'text', cad_layer_id: SITE,
    text: 'CUPBOARD RUNS 100 BEHIND\nPORTAL COLUMN\n(100 NOM - CHECK WITH BUILDER)',
    geom: { at: { x: 2067.5, y: -780 }, width: 36.6 }, style: { size: 2.5, align: 'center', border: 'box', bgPad: 1 } },
]
for (const row of rows) {
  const r = await sb.from('room_annotations').insert({ ...row, sort_order: ++so }).select('id').single()
  console.log(row.view, row.text.split('\n')[0], r.error?.message ?? r.data.id)
}
