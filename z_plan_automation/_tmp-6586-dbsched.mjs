// Temp: show / set RHK6586 drawer box schedule.  node _tmp-6586-dbsched.mjs [--set <scheduleId>]
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) { console.log('sign-in failed', error.message); process.exit(1) } }
const { data: projs } = await sb.from('projects').select('id,name,drawerbox_schedule_id,inner_drawerbox_schedule_id').ilike('id::text', 'bada385f%')
const proj = projs?.[0] ?? (await sb.from('projects').select('id,name,drawerbox_schedule_id,inner_drawerbox_schedule_id').ilike('name', '%6586%')).data?.[0]
console.log('project', proj)
const { data: rooms } = await sb.from('rooms').select('id,name,drawerbox_schedule_id,inner_drawerbox_schedule_id').eq('project_id', proj.id)
console.log('rooms', rooms)
const { data: sch } = await sb.from('drawerbox_schedules').select('id,name,active,material_id,bottom_material_id').order('name')
console.log('drawerbox schedules', sch.map(s => `${s.id} ${s.active ? '' : '(inactive) '}${s.name}`).join('\n'))
const { data: isch } = await sb.from('inner_drawerbox_schedules').select('id,name,active').order('name')
console.log('inner schedules', isch.map(s => `${s.id} ${s.active ? '' : '(inactive) '}${s.name}`).join('\n'))
const i = process.argv.indexOf('--set')
if (i > 0) {
  const id = process.argv[i + 1]
  const a = await sb.from('projects').update({ drawerbox_schedule_id: id }).eq('id', proj.id).select('id')
  const b = await sb.from('rooms').update({ drawerbox_schedule_id: id }).eq('project_id', proj.id).not('drawerbox_schedule_id', 'is', null).select('id,name')
  console.log('set project', a.error?.message ?? a.data, 'rooms', b.error?.message ?? b.data)
}
