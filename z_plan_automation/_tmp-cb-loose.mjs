// Construct Building: rewrite the 7 TEPF carriers' applied panels to fixed loose parts,
// Whiteboard 16.5, standing face-on to the wall (orientation 'front': dx = width, dy = length).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { console.log(w, r.error ? 'ERR ' + r.error.message : 'ok'); return r.data }
const WB = 'd081b2a1-38a8-472c-a415-f179699a1347'
const ROOM = '773dd73b-74d6-4f0d-8710-eb9db0e0372f'
const PIECES = {
  'TC-01': { name: 'Cover 587 x 550 (loose)', dy: 587, dx: 550, edge: false },
  'TC-02': { name: 'Cover strip 430 x 60, white edge one 430 side (loose)', dy: 430, dx: 60, edge: true },
  'TC-03': { name: 'Cover strip 476 x 60, white edge one 476 side (loose)', dy: 476, dx: 60, edge: true },
  'TC-04': { name: 'Packer 300 x 70 #1 - island back wall, sink side (loose)', dy: 300, dx: 70, edge: false },
  'TC-05': { name: 'Packer 300 x 70 #2 - island back wall, sink side (loose)', dy: 300, dx: 70, edge: false },
  'TC-06': { name: 'Packer 300 x 70 #3 - island back wall, sink side (loose)', dy: 300, dx: 70, edge: false },
  'TC-07': { name: 'Packer 300 x 70 #4 - island back wall, sink side (loose)', dy: 300, dx: 70, edge: false },
}
const cabs = (await sb.from('cabinet_instances').select('id,label').eq('room_id', ROOM)).data
for (const c of cabs) {
  const p = PIECES[c.label]; if (!p) continue
  const parts = (await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', c.id)).data
  if (parts.length !== 1) { console.log(c.label, 'expected 1 part, got', parts.length); continue }
  chk(c.label + ' part', await sb.from('cabinet_custom_parts').update({
    name: p.name, expressions: {}, orientation: 'front', x: 0, y: 0, z: 0, dx: p.dx, dy: p.dy, dz: 16.5,
    material_id: WB, material_override_id: WB, grain_across: false,
    edge_top: false, edge_bottom: false, edge_left: p.edge, edge_right: false,
  }).eq('id', parts[0].id))
  chk(c.label + ' box', await sb.from('cabinet_instances').update({ dx: p.dx, dz: 16.5, notes: 'LOOSE: ' + p.name }).eq('id', c.id))
}
process.exit(0)
