import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef'
const mats = Object.fromEntries((await sb.from('materials').select('id,name').in('id', ['fca041dc-30b7-469e-9e14-d8d3aae38a57', '0bed0f26-d551-4c03-ba6a-fd7f3309b6ad'])).data.map(m => [m.id, m.name]))
for (const l of ['WC-01', 'TC-02']) {
  const { data: c } = await sb.from('cabinet_instances').select('id,part_hide_views').eq('room_id', R).eq('label', l).single()
  const cp = (await sb.from('case_parts').select('part_key,y,dy,dz,material_id').eq('cabinet_instance_id', c.id)).data
  const ip = (await sb.from('internal_parts').select('part_type,y,dx,dy,dz,material_id').eq('cabinet_instance_id', c.id)).data
  console.log(l, JSON.stringify(c.part_hide_views))
  for (const p of [...cp, ...ip]) console.log('  ', p.part_key ?? p.part_type, p.y, p.dy, p.dz, mats[p.material_id] ?? p.material_id?.slice(0, 8))
}
