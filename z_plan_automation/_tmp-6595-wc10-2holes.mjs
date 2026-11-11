// RHK6595 WC-10 (Mark 2026-11-11): dividers into the bottom = 2 holes only, 100 in from the front and the back.
// New library joint "5mm 2 Holes 100 in" (copy of "5mm Dynamic Holes" with qty 2, offset 100, spacing D - 200),
// assigned per seam in WC-10 carcase_joints for every divider:bottom seam (the top keeps the dynamic holes).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const WC10 = '4fe005a9-0d87-4364-a726-c91ad372724d', DYN = '4f3d860b'
const must = (l, r) => { if (r.error) throw new Error(l + ': ' + r.error.message); return r.data }
const NAME = '5mm 2 Holes 100 in'
let jt = must('find', await sb.from('joint_types').select('id').eq('name', NAME))[0]
if (!jt) {
  jt = must('joint type', await sb.from('joint_types').insert({ name: NAME, description: '2 x 5mm holes into part b, 100 in from the front and the back (fixed count). First used on RHK6595 WC-10 wine rack dividers into the bottom (Mark 2026-11-11).' }).select('id'))[0]
  const dynId = must('dyn', await sb.from('joint_types').select('id,name').eq('name', '5mm Dynamic Holes'))[0].id
  if (!dynId.startsWith(DYN)) throw new Error('dynamic joint id changed')
  const src = must('dyn ops', await sb.from('joint_type_operations').select('*').eq('joint_type_id', dynId))
  for (const o of src) {
    const { id, created_at, updated_at, ...rest } = o
    must('op', await sb.from('joint_type_operations').insert({ ...rest, joint_type_id: jt.id, qty: 2, offset_z_mm: 100, spacing_mm: 262,
      expressions: { depth_mm: 'T', spacing_mm: 'D - 200', offset_y_mm: 'CW / 2' }, notes: '2 holes, 100 in from each end' }).select('id'))
  }
  console.log('new joint', jt.id)
}
const { data: [c] } = await sb.from('cabinet_instances').select('carcase_joints').eq('id', WC10)
if (!fs.existsSync('z_plan_automation/_tmp-6595-wc10-2holes-before.json')) fs.writeFileSync('z_plan_automation/_tmp-6595-wc10-2holes-before.json', JSON.stringify(c))
const cj = { ...(c.carcase_joints ?? {}) }
for (let i = 0; i < 8; i++) cj[`int_divider_${i}:bottom`] = jt.id   // 5 dividers in the 6 x 3 grid; spare keys are ignored
must('WC-10 joints', await sb.from('cabinet_instances').update({ carcase_joints: cj }).eq('id', WC10).select('id'))
console.log('WC-10 carcase_joints', JSON.stringify(cj))
