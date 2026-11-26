// RHK6478 Master WIR: list cabinets, heights, side/back part lengths, fixed shelves (query only).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'e58340a6-4b68-4543-a1ca-a686b515a647'
const { data: cabs, error } = await sb.from('cabinet_instances').select('id,label,dx,dy,dz,pos_z,split,material_overrides').eq('room_id', R).order('label')
if (error) throw error
for (const c of cabs) {
  const { data: parts } = await sb.from('case_parts').select('part_key,dx,dy,dz,material_id').eq('cabinet_instance_id', c.id)
  const long = (parts ?? []).filter(p => Math.max(p.dx, p.dy) > 2000).map(p => `${p.part_key} ${p.dx}x${p.dy}`)
  console.log(c.label, 'dx', c.dx, 'dy', c.dy, 'z', c.pos_z, 'split', JSON.stringify(c.split), '|', long.join('; '))
}
