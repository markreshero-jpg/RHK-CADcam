import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const SET = process.argv.includes('--set')
const cabs = (await sb.from('cabinet_instances').select('id,label,edge_overrides').eq('room_id', 'a496c328-cfda-4f74-8c6d-175edd8e5907').in('label', ['WC-07', 'WC-08', 'WC-11', 'WC-12'])).data
for (const c of cabs) {
  const p = (await sb.from('case_parts').select('*').eq('cabinet_instance_id', c.id)).data ?? []
  console.log(Object.keys(p[0]||{}).filter(k=>/edge|band|tape/i.test(k)), JSON.stringify(p.map(x=>Object.fromEntries(Object.entries(x).filter(([k])=>/edge|band|tape/i.test(k)))))); console.log(c.label, JSON.stringify(p.map(x => [x.part_key, x.dx, x.dy, x.dz, x.material_id?.slice(0, 8), JSON.stringify(x.edge_band)])))
  if (SET) {
    const ov = { ...(c.edge_overrides ?? {}) }
    for (const x of p) if (x.material_id?.startsWith('3b486c8f')) ov[`case_${x.part_key}`] = { top: false, bottom: false, left: false, right: false }
    const { error } = await sb.from('cabinet_instances').update({ edge_overrides: ov }).eq('id', c.id); console.log(error ? 'ERR' : 'set', Object.keys(ov))
  }
}
