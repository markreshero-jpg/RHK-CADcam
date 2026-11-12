// RHK6456 Morris: F&P Double DishDrawer custom fronts + kick, fixed loose parts,
// 2pac Resene Alabaster on Satin Board 18 (no edging), standing face-on (orientation 'front').
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { console.log(w, r.error ? 'ERR ' + r.error.message : 'ok'); return r.data }
const SATIN = 'b07a7e40-facd-4cdf-8856-60712e940b44'
const ROOM = '7923445f-73fc-4e1c-bd0e-54eb736324ad'
const PIECES = {
  'TC-01': { name: 'DishDrawer TOP front 600 x 398 - 2pac Resene Alabaster, 50 white lip pull top edge centred', dx: 600, dy: 398 },
  'TC-02': { name: 'DishDrawer BOTTOM front 600 x 334 - 2pac Resene Alabaster, 50 white lip pull top edge centred', dx: 600, dy: 334 },
  'TC-03': { name: 'DishDrawer KICK 600 x 128 - 2pac Resene Alabaster (12 off floor)', dx: 600, dy: 128 },
}
const cabs = (await sb.from('cabinet_instances').select('id,label').eq('room_id', ROOM)).data
for (const c of cabs) {
  const p = PIECES[c.label]; if (!p) continue
  const parts = (await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', c.id)).data
  if (parts.length !== 1) { console.log(c.label, 'expected 1 part, got', parts.length); continue }
  chk(c.label + ' part', await sb.from('cabinet_custom_parts').update({
    name: p.name, expressions: {}, orientation: 'front', x: 0, y: 0, z: 0, dx: p.dx, dy: p.dy, dz: 18,
    material_id: SATIN, material_override_id: SATIN, grain_across: false,
    edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
  }).eq('id', parts[0].id))
  chk(c.label + ' box', await sb.from('cabinet_instances').update({ dx: p.dx, dz: 18, notes: 'LOOSE: ' + p.name }).eq('id', c.id))
}
process.exit(0)
