// Temp: lounge TV ledge (WC-01 fs:top) LED route — top face, 19 wide x 9 deep, 50 back from the
// front (to the route's front edge), 50 in from the left end, stopped 200 short of the R300 right end.
// Horizontal case frame: pos_x = u = depth from the back (front at 300), pos_y = v = along the width.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const CAB = '4b1d32e8-bb7f-4831-9652-c240f352321f', W = 3000, D = 300
const front = 50, wide = 19, inL = 50, inR = 200
const row = { source_table: 'case_parts', source_cabinet_id: CAB, source_part_key: 'case_fs:top', output_to_cnc: true, sort_order: 0,
  plane_kind: 'face_front', operation_role: 'local', operation_type: 'route', operation_action: 'pocket', auto_tool: true,
  pos_x: D - front - wide / 2, pos_y: (inL + (W - inR)) / 2, size_dx: wide, size_dy: W - inR - inL, depth: 9, size_dz: 9,
  parameters: { note: 'LED uplight channel 19 x 9 (RHK6586, Mark 2026-10-31)' } }
const { data: old } = await sb.from('part_operations').select('id').eq('source_cabinet_id', CAB).in('source_part_key', ['fs:top', 'case_fs:top']).eq('operation_type', 'route').is('parameters->generated', null)
if (old.length) await sb.from('part_operations').delete().in('id', old.map(o => o.id))
const r = await sb.from('part_operations').insert(row).select('id,pos_x,pos_y,size_dx,size_dy,depth').single()
console.log(r.error?.message ?? JSON.stringify(r.data))
