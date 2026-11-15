// 2026-11-15: which cabinets have face_back routes/grooves with no output_face (cut on the up face). read-only.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: ops } = await sb.from('part_operations').select('source_cabinet_id,source_part_key,operation_type,parameters').in('operation_type', ['route', 'groove']).eq('plane_kind', 'face_back').is('output_face', null)
const ids = [...new Set(ops.map(o => o.source_cabinet_id))]
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,room_id').in('id', ids)
const { data: rooms } = await sb.from('rooms').select('id,name,project_id').in('id', cabs.map(c => c.room_id))
const { data: projs } = await sb.from('projects').select('id,job_number,name').in('id', rooms.map(r => r.project_id))
for (const c of cabs) { const rm = rooms.find(r => r.id === c.room_id), p = projs.find(q => q.id === rm?.project_id)
  const mine = ops.filter(o => o.source_cabinet_id === c.id)
  console.log(p?.job_number, '|', rm?.name, '|', c.label, '|', mine.map(o => `${o.source_part_key.replace(/custom_(\w{8}).*/, 'custom_$1')} ${o.operation_type} ${(o.parameters?.note ?? '').slice(0, 50)}`).join('; ')) }
