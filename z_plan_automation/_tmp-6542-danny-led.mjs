// RHK6542 Danny's Robe: recessed LED pocket route in the underside of TC-03's top.
// 18.5 wide x 9 deep, 8mm Downshear, 50 back from the front edge, 6 past both ends (Mark 2026-11-03).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a', T110 = '12163452-ea8f-407e-85a9-340204dc0e5f'
const DEPTH = 580, WIDTH = 1102, W = 18.5, D = 9, BACK_FROM_FRONT = 50, RUN_PAST = 6
const cab = chk('cab', await sb.from('cabinet_instances').select('id').eq('room_id', R).eq('label', 'TC-03').single())
const tool = chk('tool', await sb.from('cnc_tools').select('id,name,tool_number,diameter').eq('id', T110).single())
console.log('tool', tool.tool_number, tool.name, tool.diameter)
chk('del', await sb.from('part_operations').delete().eq('source_cabinet_id', cab.id).eq('source_part_key', 'case_full_top').eq('operation_type', 'route'))
const row = chk('ins', await sb.from('part_operations').insert({
  source_table: 'case_parts', source_cabinet_id: cab.id, source_part_key: 'case_full_top',
  operation_type: 'route', operation_action: 'pocket', operation_role: 'local', plane_kind: 'face_back',
  pos_x: DEPTH - BACK_FROM_FRONT - W / 2, pos_y: WIDTH / 2,
  size_dx: W, size_dy: WIDTH + 2 * RUN_PAST, size_dz: D, depth: D,
  router_tool_id: T110, auto_tool: false, output_to_cnc: true,
  fill_strategy: 'raster', raster_angle_deg: 90, raster_stepover_pct: 40,
  angle_ax: 0, angle_ay: 0, angle_az: 0, repeat_count: 1, sort_order: 0,
  parameters: { note: 'Recessed LED strip route 18.5 x 9, 50 back from the front, 6 past both ends' },
}).select('id,pos_x,pos_y,size_dx,size_dy,depth,plane_kind').single())
console.log(row)
chk('note', await sb.from('room_annotations').update({ text: 'COB LED RECESSED IN UNDERSIDE OF TOP - ROUTE 18.5 x 9, 50 BACK FROM FRONT' }).eq('room_id', R).like('text', 'COB LED%'))
