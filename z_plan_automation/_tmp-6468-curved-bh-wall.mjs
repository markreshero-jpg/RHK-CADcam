// RHK6468 Kitchen: curved PB bulkhead as a real wall (Mark 2026-11-14 "make sure it's the wall", shows in 3D).
// Drop / shaped nib wall (z_nib_wall N4, 469351a): outline = wall face behind the kitchen run + S-curve 460 out
// (DWG 7.02), base 1620 (bench 920 + 700 stone, DWG 7.03 Elev 1) to the 2400 ceiling. Replaces the CAD stand-in.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const R = '58bac32f-cdca-4a86-a1a4-c29af7ef9430'
const NAME = 'Curved PB Bulkhead'
const X0 = 3328, OUT = 460
const yN0 = -2374, yN1 = -1448, yS1 = -438, yS0 = 432
const ease = t => (1 - Math.cos(Math.PI * t)) / 2
const N = 14, curve = []
for (let i = 0; i <= N; i++) { const t = i / N; curve.push({ x: X0 + OUT * ease(t), y: yN0 + (yN1 - yN0) * t }) }
for (let i = 1; i <= N; i++) { const t = i / N; curve.push({ x: X0 + OUT * (1 - ease(t)), y: yS1 + (yS0 - yS1) * t }) }
const outline = curve.map(p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }))   // closes back along the wall face

const walls = chk('walls', await sb.from('walls').select('id,name,sort_order').eq('room_id', R))
if (!walls.some(w => w.name === NAME)) {
  chk('ins', await sb.from('walls').insert({ room_id: R, name: NAME, sort_order: Math.max(...walls.map(w => w.sort_order)) + 1,
    wall_type: 'nib', pos_x: X0, pos_y: yS0, angle: 270, length: yS0 - yN0, thickness: 0, height: null, base_height: 1620, outline }))
  console.log('wall added')
}
// CAD stand-in out (my rows: the 4 drawn by _tmp-6468-curved-bh.mjs)
const ann = chk('ann', await sb.from('room_annotations').select('id,text,kind,view,sort_order').eq('room_id', R).gte('sort_order', 900).lte('sort_order', 903))
const mine = ann.filter(a => a.kind !== 'text' || (a.text ?? '').startsWith('CURVED PB BULKHEAD'))
if (mine.length) { chk('del', await sb.from('room_annotations').delete().in('id', mine.map(a => a.id))); console.log('CAD removed', mine.length) }
