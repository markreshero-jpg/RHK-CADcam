import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const [ROOM, labels] = process.argv.slice(2)
const cabs = (await sb.from('cabinet_instances').select('id,label').eq('room_id', ROOM).in('label', labels.split(','))).data
const lab = id => cabs.find(c => c.id === id)?.label
const mats = Object.fromEntries((await sb.from('materials').select('id,name')).data.map(m => [m.id, m.name]))
for (const t of ['case_parts', 'cabinet_custom_parts']) {
  const r = await sb.from(t).select('*').in('cabinet_instance_id', cabs.map(c => c.id))
  if (r.error) { console.log(t, r.error.message); continue }
  for (const p of r.data) console.log(t, lab(p.cabinet_instance_id), p.part_key ?? p.name, p.dx, p.dy, p.dz, mats[p.material_id] ?? p.material_id)
}
