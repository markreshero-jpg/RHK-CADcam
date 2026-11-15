// RHK6468 WIR (Mark 2026-11-15): TC-17 mirror frame in 32 (33 = 2 x 16.5 PT) -> new "PT Colour Matt 33mm" board
// (parent + Classic White Matt colour, copied from the 16 rows) as the frame's exposed material.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const strip = m => { const { id, created_at, updated_at, ...rest } = m; return rest }
const P16 = '377c999c-18fa-4318-ba3d-93f858a1d652', C16 = 'fcfa8ede-490a-4dfc-bee9-42923d1e9c0f'
let parent = chk('p', await sb.from('materials').select('id').eq('name', 'PT Colour Matt 33mm')).at(0)
if (!parent) parent = chk('pi', await sb.from('materials').insert({ ...strip(chk('p16', await sb.from('materials').select('*').eq('id', P16).single())), name: 'PT Colour Matt 33mm', dz: 33 }).select('id').single())
let col = chk('c', await sb.from('materials').select('id').eq('name', 'PT Colour Matt 33mm – Classic White Matt')).at(0)
if (!col) col = chk('ci', await sb.from('materials').insert({ ...strip(chk('c16', await sb.from('materials').select('*').eq('id', C16).single())), name: 'PT Colour Matt 33mm – Classic White Matt', dz: 33, parent_id: parent.id }).select('id').single())
console.log('33 board', parent.id, col.id)
const R = 'dfa682a3-020b-4704-8661-3dbbd6cdf224'
const f = chk('f', await sb.from('cabinet_instances').select('id,material_overrides').eq('room_id', R).eq('label', 'TC-17').single())
chk('upd', await sb.from('cabinet_instances').update({ material_overrides: { ...(f.material_overrides ?? {}), exposed: col.id, interior: col.id } }).eq('id', f.id))
console.log('TC-17 frame -> 33')
