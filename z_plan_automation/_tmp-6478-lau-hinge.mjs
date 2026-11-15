// RHK6478 Laundry TC-07/TC-08: hinge 3 plate sat over the 693 shelf hole; lock it lower (Y arg) clear of the holes.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const Y = Number(process.argv[2])
const ids = ['f074b919-9491-4ae4-a7b5-fc3663140f73', 'dcf95031-a5ee-43ce-8b21-9fd4a8015598']
const { data } = await sb.from('hinge_instances').select('id,cabinet_instance_id,row_index,col_index,sort_order,y_position_mm,y_locked').in('cabinet_instance_id', ids).order('cabinet_instance_id').order('col_index').order('sort_order')
for (const h of data) console.log(h.cabinet_instance_id.slice(0, 4), h.col_index, h.sort_order, h.y_position_mm, h.y_locked)
if (Y) for (const h of data.filter(h => h.sort_order === 2)) {
  const { error } = await sb.from('hinge_instances').update({ y_position_mm: Y, y_locked: true }).eq('id', h.id)
  console.log('set', h.cabinet_instance_id.slice(0, 4), h.col_index, Y, error?.message ?? 'ok')
}
process.exit(0)
