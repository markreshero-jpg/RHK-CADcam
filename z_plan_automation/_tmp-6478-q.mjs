import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const P = 'fa0884a2-abd1-4370-adfa-a30044e88ef2', R = 'b6377e60-bed3-4e5c-af80-7ea320db6ff5'
const { data: m } = await sb.from('materials').select('*').eq('id', 'b07a7e40-facd-4cdf-8856-60712e940b44').single()
console.log('board', JSON.stringify(m))
for (const t of ['job_materials', 'job_toekick_materials', 'room_materials', 'room_toekick_materials']) {
  const q = t.startsWith('job') ? sb.from(t).select('*').eq('project_id', P) : sb.from(t).select('*').eq('room_id', R)
  const { data, error } = await q
  console.log(t, error?.message ?? JSON.stringify(data))
}
const { data: cols } = await sb.from('door_schedule_materials').select('id,colour_name,material_id,is_default').eq('schedule_id', 'bec37dbd-7fd1-44c7-acc1-38c74981e059')
console.log('range', JSON.stringify(cols))
const { data: c } = await sb.from('cabinet_instances').select('label,rule_overrides').eq('room_id', R)
console.log(JSON.stringify(c))
