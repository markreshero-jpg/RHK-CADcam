// 2026-11-15: face_back hand LED routes per job -> project id, room, cabinet, custom orientation, depth. read-only.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: ops } = await sb.from('part_operations').select('source_cabinet_id,source_table,source_part_key,operation_type,depth,size_dz').in('operation_type', ['route', 'groove']).eq('plane_kind', 'face_back').is('output_face', null)
const ids = [...new Set(ops.map(o => o.source_cabinet_id))]
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,room_id').in('id', ids)
const { data: rooms } = await sb.from('rooms').select('id,name,project_id').in('id', cabs.map(c => c.room_id))
const { data: projs } = await sb.from('projects').select('id,job_number').in('id', rooms.map(r => r.project_id))
const cids = ops.filter(o => o.source_table === 'custom_parts').map(o => o.source_part_key.slice(7))
const { data: cps } = await sb.from('cabinet_custom_parts').select('id,orientation,name').in('id', cids)
const out = ops.filter(o => cabs.some(x => x.id === o.source_cabinet_id)).map(o => { const c = cabs.find(x => x.id === o.source_cabinet_id), r = rooms.find(x => x.id === c.room_id), p = projs.find(x => x.id === r.project_id)
  const cp = cps.find(x => `custom_${x.id}` === o.source_part_key)
  return { job: p.job_number, project: p.id, room: r.name, cab: c.label, cabId: c.id, key: o.source_part_key, part: cp?.name ?? o.source_part_key, orient: cp?.orientation ?? null, depth: o.depth ?? o.size_dz } })
console.log('orphan ops (cabinet gone):', ops.filter(o => !cabs.some(x => x.id === o.source_cabinet_id)).map(o => o.source_cabinet_id))
console.log(JSON.stringify(out.sort((a, b) => (a.job + a.room + a.cab).localeCompare(b.job + b.room + b.cab)), null, 0).replace(/\},\{/g, '},\n{'))
