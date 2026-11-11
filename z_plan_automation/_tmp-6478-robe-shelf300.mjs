// RHK6478 Darby 2026-11-11 + Mark: robes (Bed 2 / Bed 3 / Guest) - top fixed shelf with 300 clear above it to the carcass top,
// top hanging rail unlocked (library centre-pillar drop under the shelf, ~1950-1980 AFF). Lower rails / drawers untouched.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) { console.log('ERR', t, r.error.message); process.exit(1) } return r.data }
const T = 16.5
for (const R of ['761f434a-cdc8-4cb8-b1dc-da69ae78f12a', '3ff6e510-bc3c-4249-9206-8939e7b8938e', '19f84132-6ed5-49b5-a0da-0f916966dcbb']) {
  const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,pos_z,dy,internal_grid').eq('room_id', R).like('label', 'TC-%'))
  for (const c of cabs) {
    const ch = c.internal_grid?.tree?.children
    if (!ch || ch.length < 2) continue
    const shelfY = c.dy - T - 300 - T                    // top shelf underside, carcass coords
    const below = ch.slice(0, -2).reduce((s, k) => s + k.size + T, 0)  // sections + separators under the hang section
    const ig = structuredClone(c.internal_grid)
    const hang = ig.tree.children[ig.tree.children.length - 2]
    hang.size = shelfY - T - below
    // top rail = highest locked rail -> unlocked
    const rails = hang.section.fittings.filter(f => f.key === 'HANGING_RAIL_OVAL').sort((a, b) => (b.y_position ?? 0) - (a.y_position ?? 0))
    if (rails[0]) { rails[0].y_locked = false; delete rails[0].y_position }
    chk(c.label, await sb.from('cabinet_instances').update({ internal_grid: ig }).eq('id', c.id))
    console.log(R.slice(0, 8), c.label, 'shelf top', c.pos_z + shelfY + T, 'AFF, hang size', hang.size)
  }
}
process.exit(0)
