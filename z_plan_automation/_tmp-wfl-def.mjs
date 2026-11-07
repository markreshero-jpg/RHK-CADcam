// Library: WF-L wall filler (Mark 2026-11-07, RHK6595 WC-10). One board standing side-on between a wall
// cabinet and the wall, seen only on its front edge. Cut to an L in side view: 70 front leg the full height +
// 70 bottom leg the full depth (seen from underneath), front + bottom edges taped. Thickness = the exposed board
// (assembly width = that thickness). The notch is a formula, so the legs stay 70 at any height / depth.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const wep = (await sb.from('cabinet_definitions').select('*').eq('name', 'WEP').single()).data
const have = (await sb.from('cabinet_definitions').select('id').eq('name', 'WF-L')).data
if (have.length) { console.log('WF-L exists', have[0].id); process.exit(0) }
// eslint-disable-next-line no-unused-vars
const { id, created_at, updated_at, thumbnail_svg, ...base } = wep
const part = {
  ...wep.custom_parts[0],
  name: 'L Filler',
  expressions: { dx: 'cab.d', dy: 'cab.h', dz: 't.exposed' },
  // Side panel edges: right = front, bottom = underside (left = back, top = top).
  edge_top: false, edge_left: false, edge_right: true, edge_bottom: true,
  // Side-part cut-out frame: x 'right' = top, y from the front. Corner notch off the back-top.
  part_cutouts: [{ id: 'L', kind: 'notch', shape: 'rect', edge: 'back', w: 'cab.h - 70', d: 'cab.d - 70',
    x: { from: 'right', off: 0 }, y: { from: 'back', off: 0 }, depth: null, source: 'user' }],
}
const row = { ...base, name: 'WF-L', default_dx: 18, default_dy: 436, default_dz: 690, sort_order: (wep.sort_order ?? 100) + 1,
  description: 'Wall filler, L-shaped: one board between a wall cabinet and the wall, seen on its front edge (width = board thickness). Side view is an L: 70 front leg full height + 70 bottom leg full depth (seen from underneath); front + bottom edges taped. Legs stay 70 as it stretches. Match the colour of the cabinet beside it.',
  custom_parts: [part] }
const r = await sb.from('cabinet_definitions').insert(row).select('id,name')
console.log(r.error?.message ?? JSON.stringify(r.data))
