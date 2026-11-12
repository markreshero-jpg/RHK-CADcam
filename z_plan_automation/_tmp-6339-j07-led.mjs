// RHK6339 J07 (Mark 2026-11-12): LED route 18.5 x 9 in the underside of the WC-02 33 top, centred in the 80 overhang
// (centre 345 from the wall = 40 back from the front edge), over the open shelves 960-2977 (stopped both ends).
// Under panel op frame: pos_x = depth from the back, pos_y = along the wall from the top's left end (RHK6586 WC-09).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef', T110 = '12163452-ea8f-407e-85a9-340204dc0e5f'
const W = 18.5, D = 9, X0 = 960, X1 = 2977
const top = chk('top', await sb.from('cabinet_instances').select('id').eq('room_id', R).eq('label', 'WC-02').single())
const part = chk('cp', await sb.from('cabinet_custom_parts').select('id,name').eq('cabinet_instance_id', top.id).single())
chk('name', await sb.from('cabinet_custom_parts').update({ name: 'Top' }).eq('id', part.id))
const key = 'custom_' + part.id
chk('del', await sb.from('part_operations').delete().eq('source_cabinet_id', top.id).eq('source_part_key', key).eq('operation_type', 'route'))
console.log(chk('ins', await sb.from('part_operations').insert({
  source_table: 'custom_parts', source_cabinet_id: top.id, source_part_key: key,
  operation_type: 'route', operation_action: 'pocket', operation_role: 'local', plane_kind: 'face_back',
  pos_x: 385 - 40, pos_y: (X0 + X1) / 2, size_dx: W, size_dy: X1 - X0, size_dz: D, depth: D,
  router_tool_id: T110, auto_tool: false, output_to_cnc: true, fill_strategy: 'raster', raster_angle_deg: 90, raster_stepover_pct: 40,
  angle_ax: 0, angle_ay: 0, angle_az: 0, repeat_count: 1, sort_order: 0,
  parameters: { note: 'LED route 18.5 x 9 in the underside, centred in the 80 overhang (40 back from the front), over the open shelves 960-2977' },
}).select('id,source_part_key,pos_x,pos_y,size_dy').single()))
