// RHK6468 Kitchen: curved PB bulkhead over the kitchen run (Wall 7) by the builder, drawn as CAD in a wall
// colour (Mark 2026-11-14). From DWG 7.02 plan ("LINE OF RANGEHOOD BULKHEAD ABOVE", 460 off the wall) and
// DWG 7.03 Elev 1 (PB from bench 920 + 700 stone = 1620 to the 2400 ceiling).
// Plan: closed dashed outline wall face -> S-curve -> 460 straight -> S-curve back, grey fill. Elevation: band.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const R = '58bac32f-cdca-4a86-a1a4-c29af7ef9430'
const W7 = '0e42fb68-7b69-49a8-a195-20ea8035580b'
const LAYER = '2cef1c43-289a-4bad-b300-6de894984764'   // General (Construction is off in Line Drawing Print)
const TAG = 'CURVED PB BULKHEAD'
const X0 = 3328, OUT = 460
const yN0 = -2374, yN1 = -1448, yS1 = -438, yS0 = 432   // wall -> 460 (north), 460 -> wall (south)
const ease = t => (1 - Math.cos(Math.PI * t)) / 2
const N = 14
const curve = []
for (let i = 0; i <= N; i++) { const t = i / N; curve.push({ x: X0 + OUT * ease(t), y: yN0 + (yN1 - yN0) * t }) }
for (let i = 0; i <= N; i++) { const t = i / N; curve.push({ x: X0 + OUT * (1 - ease(t)), y: yS1 + (yS0 - yS1) * t }) }
const r = p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })
const wallGrey = { color: '#4b5563', weight: 0.35, fill: 'solid', fillColor: '#9ca3af', fillOpacity: 0.45 }

const old = chk('old', await sb.from('room_annotations').select('id,text,style').eq('room_id', R))
if (old.some(a => (a.text ?? '').startsWith(TAG) || a.style?.tag === 'curved-bh')) { console.log('already drawn'); process.exit(0) }
const rows = [
  { view: 'plan', kind: 'line', geom: { pts: curve.map(r), closed: true }, style: { ...wallGrey, dash: 'dashed' } },
  { view: 'plan', kind: 'text', text: `${TAG} ABOVE\n(BY BUILDER) 1620 - CEILING`,
    geom: { at: { x: X0 + 30, y: -1150 }, width: 20 }, style: { size: 2.5, color: '#374151' } },
  { view: 'elevation', kind: 'rect', wall_id: W7, wall_side: 'face', geom: { a: { x: 979 - yS0, y: -2400 }, b: { x: 979 - yN0, y: -1620 } }, style: wallGrey },
  { view: 'elevation', kind: 'text', wall_id: W7, wall_side: 'face', text: `${TAG} (BY BUILDER)\nCURVES OUT 460 - REFER TO ARCHITECT'S DETAIL`,
    geom: { at: { x: 979 - yS0 + 900, y: -2150 }, width: 60 }, style: { size: 2.5, align: 'center', color: '#374151' } },
]
chk('ins', await sb.from('room_annotations').insert(rows.map((x, i) => ({ room_id: R, cad_layer_id: LAYER, sort_order: 900 + i, ...x }))))
console.log('drawn', rows.length)
