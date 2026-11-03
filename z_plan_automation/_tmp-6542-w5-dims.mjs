// RHK6542 Study Wall 5: clear-opening dims between shelves, one vertical chain per bay (Mark 2026-11-03).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'a81555f3-22f3-4efd-947b-4e083bf49c94', W5 = '68f68f82-7289-4f47-a100-cd47decdebb2'
// bay: elevation left, width, bottom top, shelf bottoms, shelf thickness, top underside (AFF, pos_z 0)
const bays = [
  { l: 236.5,  w: 517, base: 96.5, sh: [515, 947, 1379, 1750, 2106], t: 16.5, top: 2403.5 }, // TC-06
  { l: 753.5,  w: 770, base: 113,  sh: [515, 1242, 1674, 2106],      t: 33,   top: 2387 },   // TC-07
  { l: 1523.5, w: 770, base: 113,  sh: [515, 947, 1379],             t: 33,   top: 2387 },   // TC-09
  { l: 2293.5, w: 770, base: 113,  sh: [515, 947, 1674, 2106],       t: 33,   top: 2387 },   // TC-10
]
await sb.from('room_annotations').delete().eq('room_id', R).eq('wall_id', W5).eq('kind', 'dim').contains('style', { tag: 'shelf_gap' })
const rows = []
for (const b of bays) {
  const x = b.l + b.w * 0.25, lo = [b.base, ...b.sh.map(s => s + b.t)], hi = [...b.sh, b.top]
  lo.forEach((y0, i) => rows.push({ room_id: R, view: 'elevation', wall_id: W5, wall_side: 'face', kind: 'dim',
    geom: { p1: { x, y: -y0 }, p2: { x, y: -hi[i] }, axis: 'y', offset: 0 }, style: { tag: 'shelf_gap' }, sort_order: 20 + rows.length }))
}
const { error } = await sb.from('room_annotations').insert(rows)
console.log(error?.message ?? `ok ${rows.length} dims`, rows.map(r => Math.abs(r.geom.p2.y - r.geom.p1.y)).join(' '))
