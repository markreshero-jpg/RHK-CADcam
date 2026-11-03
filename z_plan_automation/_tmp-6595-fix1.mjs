// RHK6595 Kitchen post-draw fixes: flipped island backs pos (+dx), half-mm widths, WEP front fillers,
// WC-02 column hinges clear of the shelf holes + no adj shelf in the 390 top.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ROOM = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb'
const { data: cabs } = await sb.from('cabinet_instances').select('*').eq('room_id', ROOM)
const by = l => cabs.find(c => c.label === l)
const upd = async (l, patch) => { const r = await sb.from('cabinet_instances').update(patch).eq('id', by(l).id); console.log(l, r.error?.message ?? 'ok', JSON.stringify(patch).slice(0, 120)) }
await upd('BC-01', { dx: 616.5, pos_x: 990 + 616.5 })
await upd('BC-02', { pos_x: 1606.5 + 690 })
await upd('BC-03', { pos_x: 2296.5 + 689 })
for (const l of ['BC-04', 'BC-08', 'BC-09', 'BC-10', 'WC-01']) await upd(l, { dx: 16.5 })
await upd('WC-07', { dx: 18.5 })
await upd('WC-08', { dx: 745.5 })
await upd('WC-09', { dx: 2034.5 })
// WEP -> front filler in the door plane
for (const l of ['WC-01', 'WC-07']) {
  const r = await sb.from('cabinet_custom_parts').update({ orientation: 'front', expressions: { z: 'cab.d + 2', dx: 'cab.w', dy: 'cab.h', dz: 't.exposed' } }).eq('cabinet_instance_id', by(l).id).eq('name', 'Applied Panel')
  console.log(l, 'filler', r.error?.message ?? 'ok')
}
// Column: 1000 doors hinged 100 / 880 from the door bottom; 390 top without an adj shelf
const c = by('WC-02')
const fg = c.face_grid
for (const z of fg.zones) if (z.row_index === 0) z.hinges = [100, 880]
const ig = { tree: { type: 'hsplit', children: [{ size: 975, section: { type: 'open', fittings: [{ type: 'adj_shelf', y_locked: false }] }, separator: 'fixed_shelf' }, { section: { type: 'open', fittings: [] } }] } }
await upd('WC-02', { face_grid: fg, internal_grid: ig })
