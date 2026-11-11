// Library: WF wall filler, straight (Mark 2026-11-11, RHK6595 WC-01). The WF-L without the L: one 70 strip standing
// side-on between a wall cabinet and the wall, full height, front edge flush with the door face (like BFK, which is
// the base version). Front + bottom edges taped (the bottom end shows from underneath). Width = board thickness.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const have = (await sb.from('cabinet_definitions').select('id').eq('name', 'WF')).data
if (have.length) { console.log('WF exists', have[0].id); process.exit(0) }
const wfl = (await sb.from('cabinet_definitions').select('*').eq('name', 'WF-L').single()).data
// eslint-disable-next-line no-unused-vars
const { id, created_at, updated_at, thumbnail_svg, ...base } = wfl
const part = {
  ...wfl.custom_parts[0],
  name: 'Filler', x: 0, y: 0, z: 0, dx: 70, dy: 720, dz: 18,
  expressions: { z: 'cab.d + t.door + 2 - 70', dx: '70', dy: 'cab.h', dz: 't.exposed' },
  edge_top: false, edge_left: false, edge_right: true, edge_bottom: true,   // side part: right = front, bottom = underside
  part_cutouts: [],
}
const row = { ...base, name: 'WF', default_dx: 18, default_dy: 720, default_dz: 320, sort_order: (wfl.sort_order ?? 102) - 1,
  description: 'Wall filler, straight, material thickness: one 70 strip standing side-on between a wall cabinet and the wall, full height, front edge flush with the door face (the only part seen). Front + bottom edges taped. Set the width to the board (18 / 16.5). The WF-L without the L; BFK is the base version. Match the colour of the cabinet beside it.',
  custom_parts: [part] }
const r = await sb.from('cabinet_definitions').insert(row).select('id,name')
console.log(r.error?.message ?? JSON.stringify(r.data))
