import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '874fed25-8e1b-4bbf-b1ff-3090361b5dad'
const room = (await sb.from('rooms').select('*').eq('id', R).single()).data
console.log('ROOM', JSON.stringify(Object.fromEntries(Object.entries(room).filter(([k, v]) => /style|colour|color|material|override/.test(k)))))
console.log('STYLE', JSON.stringify((await sb.from('door_styles').select('*').eq('id', 'bd2b9178-5b77-4a52-b7a1-cc3765ed4bb4').single()).data))
for (const t of ['door_colours', 'colours', 'material_colours', 'door_style_colours']) {
  const r = await sb.from(t).select('*').limit(2000)
  if (r.error) { console.log(t, 'ERR', r.error.message); continue }
  const hit = r.data.filter(x => /pointer|tbc/i.test(JSON.stringify(x)))
  console.log(t, r.data.length, JSON.stringify(hit).slice(0, 2500))
}
console.log('SATIN', JSON.stringify((await sb.from('materials').select('*').eq('id', 'b07a7e40-facd-4cdf-8856-60712e940b44').single()).data))
const mats = (await sb.from('materials').select('id,name,thickness').ilike('name', '%2pac%')).data
console.log('MATS', JSON.stringify(mats))
console.log('LAUNDRY CAB OVR', JSON.stringify((await sb.from('cabinet_instances').select('label,material_overrides').eq('room_id', R)).data.filter(c => c.material_overrides && Object.keys(c.material_overrides).length)))
