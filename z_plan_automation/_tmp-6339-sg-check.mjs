// RHK6339: count resolved parts per material across the job after the Spotted Gum change.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const rooms = (await sb.from('rooms').select('id').eq('project_id', 'cf31069b-1a56-49ee-91df-dade35f68fde')).data
const cabs = (await sb.from('cabinet_instances').select('id').in('room_id', rooms.map(r => r.id))).data.map(c => c.id)
const mats = Object.fromEntries((await sb.from('materials').select('id,name')).data.map(m => [m.id, m.name]))
const count = {}
for (const t of ['case_parts', 'internal_parts', 'face_zones']) {
  const r = await sb.from(t).select('material_id').in('cabinet_instance_id', cabs)
  if (r.error) { console.log(t, r.error.message); continue }
  for (const p of r.data) { const k = t + ' | ' + (mats[p.material_id] ?? p.material_id); count[k] = (count[k] ?? 0) + 1 }
}
const cp = (await sb.from('cabinet_custom_parts').select('material_id').in('cabinet_instance_id', cabs)).data
for (const p of cp) { const k = 'custom | ' + mats[p.material_id]; count[k] = (count[k] ?? 0) + 1 }
for (const [k, v] of Object.entries(count).sort()) console.log(String(v).padStart(4), k)
