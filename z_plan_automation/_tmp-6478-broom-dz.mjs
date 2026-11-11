// RHK6478: pin the 18 2pac filler custom parts' dz formula to 18 (was t.exposed) - US Broom / DS Linen / US Hallway Linen.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
for (const R of ['f1953ab4-a03b-4439-a777-d39476156f31', '02ce23c0-9b53-454f-8bcf-f0f81daa1dc8', 'b6377e60-bed3-4e5c-af80-7ea320db6ff5']) {
  const { data: cabs } = await sb.from('cabinet_instances').select('id,label').eq('room_id', R).in('label', ['TC-01', 'TC-03', 'TC-04'])
  const { data: cps } = await sb.from('cabinet_custom_parts').select('id,expressions,material_id').in('cabinet_instance_id', cabs.map(c => c.id)).eq('name', 'Filler').eq('material_id', 'b07a7e40-facd-4cdf-8856-60712e940b44')
  for (const p of cps) { const r = await sb.from('cabinet_custom_parts').update({ expressions: { ...p.expressions, dz: '18' }, dz: 18 }).eq('id', p.id); console.log(R.slice(0, 8), p.id.slice(0, 8), r.error?.message ?? 'ok') }
}
process.exit(0)
