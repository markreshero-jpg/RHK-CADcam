// RHK6586 kitchenette (Mark 2026-10-31): bulkheads set back flush with the carcases (incl. the 45 pantry);
// WC-10 open shelf front set back to the carcase line to match.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) throw error }
const ROOM = 'a496c328-cfda-4f74-8c6d-175edd8e5907', R2 = Math.SQRT2
const C = Object.fromEntries((await sb.from('cabinet_instances').select('*').eq('room_id', ROOM)).data.map(c => [c.label, c]))
const upd = async (l, patch) => { const { error } = await sb.from('cabinet_instances').update(patch).eq('id', C[l].id); console.log(error ? 'ERR ' + l + ' ' + error.message : 'ok ' + l) }
const b = l => C[l].bulkhead
const seg = (p0, p1, id, role) => ({ type: 'line', p0, p1, edge: { id, role } })
const P = (x, y) => ({ x, y })

// Open shelf: right gable 362 (carcase line), front at 45 from (268.5, 362) to the tall side (x − y = −420).
const t = (268.5 - 362 + 420) / 2                                   // 163.25
const fx = 268.5 - t + 210, fy = 362 + t                            // local (315.25, 525.25)
await upd('WC-10', { dz: fy, footprint: { params: {}, segments: [
  seg(P(210, 0), P(478.5, 0), 'back', 'back'), seg(P(478.5, 0), P(478.5, 362), 'right', 'side'),
  seg(P(478.5, 362), P(fx, fy), 'front', 'front'), seg(P(fx, fy), P(0, 210), 'angle', 'side'), seg(P(0, 210), P(210, 0), 'back2', 'back')] } })

// WC-08 (Wall 2): fascia on the 362 carcase line, right return to match.
await upd('WC-08', { bulkhead: { ...b('WC-08'), front: 'carcase', right: { ...b('WC-08').right, depth: 362 } } })
// WC-11 (Wall 1, over the shelf front): front = shelf front line x + y = 630.5 → 445.8 off the 45 wall; front ends at (268.5, 362).
const along = 1605 + (268.5 - 362) / R2                             // 1538.9
await upd('WC-11', { dz: +(630.5 / R2).toFixed(1), dx: +(along - 1308).toFixed(1), bulkhead: { ...b('WC-11'), front: 'carcase' } })
// WC-07 (Wall 1, fridge run): fascia on the 602 carcase line — meets the pantry carcase face exactly at the pantry front corner (offset 622).
await upd('WC-07', { pos_x: -695.108, pos_y: 695.108, dx: 686, bulkhead: { ...b('WC-07'), front: 'carcase' } })
// WC-12 (pantry): fascia on the pantry's 45 carcase face (y 1120.8), back line 300 behind; 851.4 wide (wall → pantry front corner).
await upd('WC-12', { pos_x: -1120.8, pos_y: 820.8, dx: 851.4 })
{ const { error } = await sb.from('walls').update({ pos_x: -820.8, pos_y: 820.8, length: +(851.4 - 300 - 300 * Math.tan(Math.PI / 8)).toFixed(1) }).eq('id', C['WC-12'].wall_id); console.log(error ? 'ERR wall' : 'ok Pantry BH line') }
