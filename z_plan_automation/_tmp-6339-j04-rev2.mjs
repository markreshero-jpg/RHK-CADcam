// RHK6339 J04 rev 2 (Mark 2026-11-12): WC-03 no end on the left - left_side Removed (hidden in all views,
// not made), top / bottom / back run 33 further left into the 14 timber lining (sw 2210, ox -33).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: c } = await sb.from('cabinet_instances').select('id,part_pos_overrides,part_hide_views')
  .eq('room_id', 'b2252689-fdc9-4fd7-be9a-f29853f0391e').eq('label', 'WC-03').single()
const pov = { ...(c.part_pos_overrides ?? {}) }
for (const k of ['case_full_top', 'case_bottom', 'case_back']) pov[k] = { oy: 0, oz: 0, ...(pov[k] ?? {}), ox: -33, sw: 2210 }
const hide = { ...(c.part_hide_views ?? {}), case_left_side: ['plan', 'elevation', '3d'] }
const r = await sb.from('cabinet_instances').update({ part_pos_overrides: pov, part_hide_views: hide,
  notes: 'J04 open shelf 4 bays, 33 veneer, 17 veneer back. No left end: top / bottom / back run into the 14 lining. Top + right side 700 deep.' }).eq('id', c.id)
console.log(r.error?.message ?? 'ok', JSON.stringify(pov))
