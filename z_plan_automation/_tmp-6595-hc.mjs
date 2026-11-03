// RHK6595 WC-10: half-check the 3 x 3 cubby grid (z_dividers V5) — flag the cubby hsplit.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb'
const c = (await sb.from('cabinet_instances').select('id,internal_grid').eq('room_id', R).eq('label', 'WC-10')).data[0]
if (process.argv[2] === 'show') {
  const ps = (await sb.from('internal_parts').select('part_type,sort_order,dx,dy,dz,x,y,z,outline').eq('cabinet_instance_id', c.id).order('part_type').order('sort_order')).data
  for (const p of ps) console.log(p.part_type, p.sort_order, `${p.dx}x${p.dy}x${p.dz} @${p.x},${p.y},${p.z}`, p.outline ? JSON.stringify(p.outline.map(q => [+q.x.toFixed(2), +q.y.toFixed(2)])) : '')
  const sj = await sb.from('cabinet_seam_joints').select('seam_key').eq('cabinet_instance_id', c.id)
  console.log('seams', sj.error?.message ?? JSON.stringify(sj.data?.map(s => s.seam_key)))
} else {
  const g = c.internal_grid
  g.tree.children[0].section.half_check = true
  // Square cubbies in 18 board: block 400 = 3 x 121.3 + 2 x 18, every row / column equal.
  g.tree.children[0].size = 400
  const unsize = s => { if (s.type === 'open') return; for (const k of s.children) { delete k.size; unsize(k.section) } }
  unsize(g.tree.children[0].section)
  const r = await sb.from('cabinet_instances').update({ internal_grid: g }).eq('id', c.id)
  console.log('flag', r.error?.message ?? 'ok')
}
