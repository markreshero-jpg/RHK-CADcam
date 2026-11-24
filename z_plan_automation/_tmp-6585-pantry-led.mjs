// RHK6585 Pantry: recessed LED route 18.5 x 9 in the underside of the overhead under panel (WC-08), 60 back from its front edge, 6 past both ends.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '7b416272-2861-4bf8-a60f-94f5632aa439', T110 = '12163452-ea8f-407e-85a9-340204dc0e5f'
const cab = chk('c', await sb.from('cabinet_instances').select('id,dx,dz').eq('room_id', R).eq('label', 'WC-08').single())
const up = chk('p', await sb.from('cabinet_custom_parts').select('id,name').eq('cabinet_instance_id', cab.id).single())
const key = `custom_${up.id}`, W = 18.5, D = 9, len = Number(cab.dx), depth = Number(cab.dz)
const have = chk('h', await sb.from('part_operations').select('id').eq('source_cabinet_id', cab.id).eq('source_part_key', key).eq('operation_type', 'route'))
if (have.length) { console.log('route already there'); process.exit(0) }
console.log(chk('ins', await sb.from('part_operations').insert({
  source_table: 'custom_parts', source_cabinet_id: cab.id, source_part_key: key,
  operation_type: 'route', operation_action: 'pocket', operation_role: 'local', plane_kind: 'face_back',
  pos_x: depth - 60 - W / 2, pos_y: len / 2, size_dx: W, size_dy: len + 12, size_dz: D, depth: D,
  router_tool_id: T110, auto_tool: false, output_to_cnc: true,
  fill_strategy: 'raster', raster_angle_deg: 90, raster_stepover_pct: 40,
  angle_ax: 0, angle_ay: 0, angle_az: 0, repeat_count: 1, sort_order: 0,
  parameters: { note: 'Recessed LED strip route 18.5 x 9 in the underside, 60 back from the under panel front edge, 6 past both ends' },
}).select('source_part_key,pos_x,pos_y,size_dx,size_dy,depth').single()))
process.exit(0)
