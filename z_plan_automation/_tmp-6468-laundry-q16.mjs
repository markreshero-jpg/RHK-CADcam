import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '874fed25-8e1b-4bbf-b1ff-3090361b5dad'
const cabs = (await sb.from('cabinet_instances').select('id,label').eq('room_id', R)).data
const ids = cabs.map(c => c.id), lab = Object.fromEntries(cabs.map(c => [c.id, c.label]))
for (const t of ['case_parts']) {
  const r = await sb.from(t).select('*').in('cabinet_instance_id', ids)
  if (r.error) { console.log(t, r.error.message); continue }
  const mats = Object.fromEntries(((await sb.from('materials').select('id,name').in('id', [...new Set(r.data.map(p => p.material_id).filter(Boolean))])).data ?? []).map(m => [m.id, m.name]))
  const agg = {}
  for (const p of r.data) { const k = `${p.part_name ?? p.name ?? p.part_code ?? JSON.stringify(Object.keys(p))} | ${mats[p.material_id] ?? p.material_id} | ${p.dz ?? p.thickness}`; agg[k] = (agg[k] ?? new Set()).add(lab[p.cabinet_instance_id]) }
  for (const [k, v] of Object.entries(agg)) console.log(k, [...v].join(','))
  // next
}
