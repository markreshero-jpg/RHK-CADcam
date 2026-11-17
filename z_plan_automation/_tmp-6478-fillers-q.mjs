// RHK6478: every filler-type cabinet in the job with its custom parts (orientation / size / material / edges)
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: rooms } = await sb.from('rooms').select('id,name').eq('project_id', 'fa0884a2-abd1-4370-adfa-a30044e88ef2').is('deleted_at', null)
const { data: defs } = await sb.from('cabinet_definitions').select('id,name')
const { data: mats } = await sb.from('materials').select('id,name')
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,room_id,cabinet_definition_id,dx,dy,dz,pos_z,notes').in('room_id', rooms.map(r => r.id))
const { data: cps } = await sb.from('cabinet_custom_parts').select('cabinet_instance_id,name,orientation,dx,dy,dz,material_id,edge_top,edge_bottom,edge_left,edge_right,expressions,part_cutouts').in('cabinet_instance_id', cabs.map(c => c.id))
for (const c of cabs.sort((a, b) => (a.room_id + a.label).localeCompare(b.room_id + b.label))) {
  const def = defs.find(d => d.id === c.cabinet_definition_id)?.name ?? ''
  if (!/^(BF|TF|WF)/.test(def)) continue
  const ps = cps.filter(p => p.cabinet_instance_id === c.id)
  console.log(rooms.find(r => r.id === c.room_id).name, '|', c.label, def, `${c.dx}x${c.dy}x${c.dz} z${c.pos_z}`, '|', ps.map(p => `${p.name}/${p.orientation} ${p.dx}x${p.dy}x${p.dz} ${mats.find(m => m.id === p.material_id)?.name} E${+p.edge_top}${+p.edge_bottom}${+p.edge_left}${+p.edge_right}${p.part_cutouts?.length ? ' cut' : ''}`).join(' ; '), '|', (c.notes ?? '').slice(0, 70))
}
process.exit(0)
