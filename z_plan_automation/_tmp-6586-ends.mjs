import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const cabs = (await sb.from('cabinet_instances').select('id,label,pos_x,pos_y,dx,dy,dz,rule_overrides,bulkhead').eq('room_id', 'a496c328-cfda-4f74-8c6d-175edd8e5907').in('label', ['WC-03', 'TC-05', 'TC-06', 'WC-07', 'WC-08', 'WC-11', 'WC-02'])).data
for (const c of cabs) {
  const p = (await sb.from('case_parts').select('*').eq('cabinet_instance_id', c.id)).data
  console.log(c.label, c.pos_x, c.pos_y, c.dx, c.dy, c.dz, JSON.stringify(c.rule_overrides))
  for (const x of p) console.log('   ', x.part_key, 'pos', x.x ?? x.pos_x, x.y ?? x.pos_y, x.z ?? x.pos_z, 'size', x.dx, x.dy, x.dz)
}
