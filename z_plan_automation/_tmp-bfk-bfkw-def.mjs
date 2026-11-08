// Library (Mark 2026-11-08): BFK = material-thickness base filler: one board flat between the cabinet and the wall,
// standing side-on, only its front edge seen (like WF-L, no L). BFKW = base filler at kick height, wide: the face
// filler in the door plane (what BFK used to be). Both carry their own kick (y = cab.kick, dy = cab.h - cab.kick).
// Placed BFKs keep their own snapshot parts (job pinning), so nothing already drawn changes.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const bfk = (await sb.from('cabinet_definitions').select('*').eq('name', 'BFK').single()).data
fs.writeFileSync('z_plan_automation/_tmp-bfk-before.json', JSON.stringify(bfk, null, 1))
// 1. BFKW = the old BFK (front face filler), unless already made.
if (!(await sb.from('cabinet_definitions').select('id').eq('name', 'BFKW')).data.length) {
  // eslint-disable-next-line no-unused-vars
  const { id, created_at, updated_at, thumbnail_svg, ...base } = bfk
  const r = await sb.from('cabinet_definitions').insert({ ...base, name: 'BFKW', sort_order: (bfk.sort_order ?? 0) + 1,
    description: 'Base filler at kick height, wide: the face filler in the door plane, width = assembly width (70 default). Carries its own kick so it joins kick runs. Panel sits on the kick: y = cab.kick, height = cabinet height less kick.' }).select('id')
  console.log('BFKW', r.error?.message ?? r.data[0].id)
} else console.log('BFKW exists')
// 2. BFK = side-on board, material thickness.
const part = { ...bfk.custom_parts[0], name: 'Filler', orientation: 'side', x: 0, z: 0, dx: 580, dy: 760, dz: 18,
  expressions: { y: 'cab.kick', dx: 'cab.d + t.door + 2', dy: 'cab.h - cab.kick', dz: 't.exposed' },
  edge_top: false, edge_bottom: false, edge_left: false, edge_right: true }   // side panel: right = the seen front edge
const r = await sb.from('cabinet_definitions').update({ default_dx: 18, custom_parts: [part],
  description: 'Base filler at kick height, material thickness: one board flat between the cabinet and the wall, standing side-on, only its front edge seen (out to the door face). Set the width to the board thickness (18 / 16.5). Carries its own kick so it joins kick runs; panel sits on the kick: y = cab.kick, height = cabinet height less kick. Face filler in the door plane = BFKW.' }).eq('id', bfk.id).select('name,default_dx')
console.log('BFK', r.error?.message ?? JSON.stringify(r.data))
