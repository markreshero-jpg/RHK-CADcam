// RHK6592 rev 22 (Mark 2026-11-05): kitchen overheads either side of the rangehood WC-02 / WC-04 (+ end panel WC-05) 300 -> 380
// deep like WC-03 (steps json); one full under panel: WC-08 widened under WC-02..WC-04 (offset 1906, 1543), WC-06 + WC-07
// deleted (automation-made this session, Mark asked); WC-05 end panel shaker route (PANEL_PROFILE right = seen face).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (m, r) => { if (r.error) throw new Error(m + ': ' + r.error.message); console.log('ok', m); return r.data }
const KIT = 'dc7a22f3-ed0b-4771-a42e-4548fc4de1e1'
chk('del WC-06/07', await sb.from('cabinet_instances').delete().eq('room_id', KIT).in('label', ['WC-06', 'WC-07']).eq('rule_overrides->>UNDER_PANEL', 'true').select('label'))
const w5 = chk('WC-05', await sb.from('cabinet_instances').select('id,rule_overrides').eq('room_id', KIT).eq('label', 'WC-05').single())
chk('WC-05 profile', await sb.from('cabinet_instances').update({ rule_overrides: { ...(w5.rule_overrides ?? {}), PANEL_PROFILE: process.env.FACE ?? 'right' } }).eq('id', w5.id))
// + BC-05 (small cupboard's seen end, left of BC-06 in the Wall 1 elevation): shaker route, seen face left.
const b5 = chk('BC-05', await sb.from('cabinet_instances').select('id,rule_overrides').eq('room_id', KIT).eq('label', 'BC-05').single())
chk('BC-05 profile', await sb.from('cabinet_instances').update({ rule_overrides: { ...(b5.rule_overrides ?? {}), PANEL_PROFILE: 'left' } }).eq('id', b5.id))
