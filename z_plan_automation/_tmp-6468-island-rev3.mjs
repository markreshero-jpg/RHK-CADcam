// RHK6468 Kitchen rev 3 (Mark 2026-11-14):
//  1. stone band sits straight on the drawer backs, mouldings stick out past it: band face 5888 (300 overhang),
//     drawer backs 5868 (dz 721), BC-03 5868-5885, mouldings 5885-5918
//  2. leg veneer 3 in from the stone so the stone's back touches the WB box all round: faces 274, sides 1074
//  3. BC-17 / BC-24 gables beside the legs deleted; wine opening stays 600 (BC-19 476), BC-23 runs to the leg (1091)
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const R = '58bac32f-cdca-4a86-a1a4-c29af7ef9430'
const W8 = 'a644652d-160e-4307-a744-f3295a957419', W9 = 'ce5df504-30cd-46eb-90a2-e6dfddb1dcb6'
const all = chk('cabs', await sb.from('cabinet_instances').select('id,label,wall_id,notes').eq('room_id', R))
const upd = async (label, patch) => { const c = all.find(x => x.label === label); if (!c) throw new Error('missing ' + label); chk(label, await sb.from('cabinet_instances').update(patch).eq('id', c.id)) }

chk('w8', await sb.from('walls').update({ pos_x: 5868 }).eq('id', W8))
chk('w9', await sb.from('walls').update({ pos_x: 5885 }).eq('id', W9))
const del = all.filter(c => ['BC-17', 'BC-24'].includes(c.label))
if (del.length) chk('del', await sb.from('cabinet_instances').delete().in('id', del.map(c => c.id)))
for (const c of all.filter(c => c.wall_id === W8 && !['BC-17', 'BC-24'].includes(c.label))) await upd(c.label, { pos_x: 5868 })
await upd('BC-18', { pos_y: -2016 })
await upd('BC-19', { pos_y: -1983, dx: 476, notes: 'Drawers - 190 / 190 / rest (476: takes the 33 + 3 from the deleted end gable, wine opening stays 600)' })
await upd('BC-23', { dx: 1091, notes: 'Drawers - 190 / 190 / rest (1091: runs to the leg veneer, end gable deleted)' })
await upd('BC-03', { pos_x: 5885, notes: 'Island back panel, Veneer 17 American Oak, hard against the drawer cupboard backs, under the 300 stone band (band also on the drawer backs). 33x33 mouldings stick out 30 past the stone' })
for (const l of ['BC-27', 'BC-28', 'BC-29', 'BC-30']) await upd(l, { pos_x: 5885, notes: '33 x 33 TV moulding on the back panel, sticks out 30 past the stone band' })
const face = n => `Leg veneer wrap - ${n} face, Veneer 17 American Oak 274 x 620 (3 in from the stone, stone touches the WB box), MITRE 45 both vertical edges`
const side = n => `Leg veneer wrap - ${n} side, Veneer 17 American Oak 1074 x 620 (3 in from the stone, stone touches the WB box), MITRE 45 both vertical edges`
await upd('BC-25', { pos_x: 6168, pos_y: 1104, dx: 274, notes: face('back') })
await upd('BC-26', { pos_x: 6168, pos_y: -2616, dx: 274, notes: face('back') })
await upd('BC-51', { pos_x: 5111, pos_y: 1104, dx: 274, notes: face('front') })
await upd('BC-52', { pos_x: 5111, pos_y: -2616, dx: 274, notes: face('front') })
await upd('BC-53', { pos_x: 5111, pos_y: 1104, dz: 1055, notes: side('outer end') })
await upd('BC-54', { pos_x: 5111, pos_y: 847, dz: 1055, notes: side('inner') })
await upd('BC-55', { pos_x: 5111, pos_y: -2616, dz: 1055, notes: side('inner') })
await upd('BC-56', { pos_x: 5111, pos_y: -2873, dz: 1055, notes: side('outer end') })
console.log('db done')
