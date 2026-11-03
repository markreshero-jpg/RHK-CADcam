import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
for (const t of ['door_catalogue', 'door_styles', 'door_material_schedules', 'door_schedule_materials', 'face_zones']) {
  const { data, error } = await sb.from(t).select('*').limit(1)
  console.log(t, error?.message ?? Object.keys(data[0] ?? {}).join(','))
}
const { data: cats } = await sb.from('door_catalogue').select('id,name,thickness_mm,construction,substrate')
console.log(JSON.stringify(cats))
const { data: st } = await sb.from('door_styles').select('*')
console.log(JSON.stringify(st.map(s => ({ id: s.id, name: s.name, cat: s.catalogue_id ?? s.door_catalogue_id, sched: s.schedule_id ?? s.material_schedule_id }))))
const { data: h } = await sb.from('hardware_handles').select('id,name,grip_kind').ilike('name', '%lip%')
console.log('lip handles', JSON.stringify(h))
