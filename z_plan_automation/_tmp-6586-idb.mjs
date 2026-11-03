// Temp: add Nikpol Diamond Grey inner drawer box schedule + set it on RHK6586.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const M = '2351a864-da06-47a9-8a1a-0770451722e7', E = 'dbb43d45-7827-42a4-9683-a02fee9f40d5'
let { data: row } = await sb.from('inner_drawerbox_schedules').select('id').eq('name', 'Nikpol 16mm – Diamond Grey').maybeSingle()
if (!row) {
  const r = await sb.from('inner_drawerbox_schedules').insert({ name: 'Nikpol 16mm – Diamond Grey', description: 'Box, bottom + front: Nikpol 16mm – Diamond Grey', is_default: false, active: true,
    material_id: M, edgeband_id: E, bottom_material_id: M, bottom_edgeband_id: E, front_material_id: M, front_edgeband_id: E }).select('id').single()
  if (r.error) { console.log('ERROR', r.error.message); process.exit(1) }
  row = r.data
}
const p = await sb.from('projects').update({ inner_drawerbox_schedule_id: row.id }).eq('id', 'bada385f-41cf-411e-9536-d1e413e6d5ce').select('inner_drawerbox_schedule_id')
console.log('schedule', row.id, 'project', p.error?.message ?? p.data)
