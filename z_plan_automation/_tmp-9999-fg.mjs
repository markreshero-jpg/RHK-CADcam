// RHK9999: top-row finger gap = (100 apron - 20) + 20 FPGAP = 100 on every grip zone of the top row.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '8940d72a-1a10-4c86-a8f0-927863d3d563'
const { data: c } = await sb.from('cabinet_instances').select('id,label,face_grid').eq('room_id', R)
for (const x of c) {
  if (!x.face_grid?.zones) continue
  const top = Math.max(...x.face_grid.rows.map(r => r.row_index))
  for (const z of x.face_grid.zones) if (z.row_index === top) z.finger_gap = 100
  const { error } = await sb.from('cabinet_instances').update({ face_grid: x.face_grid }).eq('id', x.id)
  console.log(x.label, error?.message ?? 'ok')
}
