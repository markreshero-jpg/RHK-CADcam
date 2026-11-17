import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const c = (await sb.from('cabinet_instances').select('id,label,pos_z,dx,dy,dz,internal_grid,exposed_interior,top_type').eq('room_id', 'e1ef206e-138d-45cc-953d-a1a0c21f2a02')).data
console.log(JSON.stringify(c.map(({internal_grid, ...x}) => ({...x, grid: internal_grid?.tree?.type}))))
const mats = Object.fromEntries(((await sb.from('materials').select('id,name')).data).map(m => [m.id, m.name]))
for (const t of ['case_parts', 'internal_parts', 'face_parts', 'toekick_parts']) {
  const r = await sb.from(t).select('*').eq('cabinet_instance_id', c[0].id)
  if (r.error) { console.log(t, r.error.message); continue }
  for (const p of r.data) console.log(t, p.part_key ?? p.name ?? p.part_name, p.dx, p.dy, p.dz, mats[p.material_id] ?? p.material_id)
}
