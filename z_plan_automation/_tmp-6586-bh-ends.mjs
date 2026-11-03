// RHK6586 kitchenette (Mark 2026-10-31): WC-07 right return set in 18 from TC-06's outer face; WC-11 grows 18 to keep butting it.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) throw error }
const ROOM = 'a496c328-cfda-4f74-8c6d-175edd8e5907', r = Math.SQRT1_2, X0 = -1134.93, Y0 = 1134.93
const C = Object.fromEntries((await sb.from('cabinet_instances').select('id,label').eq('room_id', ROOM).in('label', ['WC-07', 'WC-11'])).data.map(c => [c.label, c]))
const upd = async (l, patch) => { const { error } = await sb.from('cabinet_instances').update(patch).eq('id', C[l].id); console.log(error ? 'ERR ' + l + ' ' + error.message : 'ok ' + l, JSON.stringify(patch)) }
const at = off => ({ pos_x: +(X0 + off * r).toFixed(3), pos_y: +(Y0 - off * r).toFixed(3) })
await upd('WC-07', { dx: 668 })                                    // 622 → 1290 (TC-06 outer face 1308 − 18)
await upd('WC-11', { ...at(1290), dx: +(1538.9 - 1290).toFixed(1) })
