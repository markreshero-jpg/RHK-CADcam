// Temp: find RHK6586 doubled 16.5 panels (notes "of 2") + their case parts edging.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: rooms } = await sb.from('rooms').select('id,name').eq('project_id', 'bada385f-41cf-411e-9536-d1e413e6d5ce')
for (const r of rooms) {
  const { data: cabs } = await sb.from('cabinet_instances').select('id,label,dx,dy,dz,pos_x,wall_id,notes,cabinet_definition_id,part_comments,edge_overrides').eq('room_id', r.id)
  for (const c of cabs.filter(c => c.dx <= 17 || /of 2|16\.5|33/i.test(c.notes ?? ''))) {
    const { data: ps } = await sb.from('case_parts').select('part_key,DX:dx,DY:dy,DZ:dz,edge_band').eq('cabinet_instance_id', c.id)
    console.log(r.name, '|', c.label, c.dx, 'x', c.dy, 'x', c.dz, '@', c.pos_x, '|', c.notes)
    for (const p of ps ?? []) console.log('    ', p.part_key, p.DX, p.DY, p.DZ, JSON.stringify(p.edge_band))
  }
}
