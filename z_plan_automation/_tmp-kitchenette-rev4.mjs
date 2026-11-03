// Temp: RHK6586 kitchenette rev 4 (Mark 2026-10-28): kick stops at the DW opening, returns both sides.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) throw error }
const ROOM = 'a496c328-cfda-4f74-8c6d-175edd8e5907'
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,rule_overrides,kick_run_id,pos_z,dy').eq('room_id', ROOM).in('label', ['KICK 2', 'BC-03', 'BC-05'])
const C = Object.fromEntries(cabs.map(c => [c.label, c]))
console.log(cabs.map(c => [c.label, c.kick_run_id, c.pos_z, c.dy]))
const upd = async (l, patch) => { const { error } = await sb.from('cabinet_instances').update(patch).eq('id', C[l].id); console.log(error ? 'ERR ' + l + ' ' + error.message : 'ok ' + l) }
await upd('KICK 2', { pos_x: 287, dx: 566, rule_overrides: { ...C['KICK 2'].rule_overrides, TOERETR: true } })
await upd('BC-05', { kick_run_id: null, has_toekick: true, pos_z: 0, dy: 880, rule_overrides: { ...C['BC-05'].rule_overrides, TOERETL: true } })
