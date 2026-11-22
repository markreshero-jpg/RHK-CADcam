// RHK6478 WIP pre-nest query: walls, annotations (full), kick runs, rails / internal parts, handle schedules
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae'
const what = process.argv[2]
if (what === 'walls') { const { data } = await sb.from('walls').select('*').eq('room_id', R); for (const w of data) console.log(JSON.stringify(w).slice(0, 600)) }
if (what === 'ann') { const { data } = await sb.from('room_annotations').select('*').eq('room_id', R); for (const a of data) console.log(JSON.stringify(a).slice(0, +process.argv[3] || 400)) }
if (what === 'room') { const { data } = await sb.from('rooms').select('*').eq('id', R).single(); console.log(JSON.stringify(data).slice(0, 3000)) }
if (what === 'kick') { const { data } = await sb.from('kick_runs').select('*').eq('room_id', R); for (const k of data ?? []) console.log(JSON.stringify(k).slice(0, 1500)) }
if (what === 'parts') {
  const { data: cabs } = await sb.from('cabinet_instances').select('id,label').eq('room_id', R)
  const ids = cabs.filter(c => process.argv.slice(3).includes(c.label))
  for (const c of ids) {
    const { data: cp } = await sb.from('case_parts').select('part_key,dx,dy,dz,x,y,z').eq('cabinet_instance_id', c.id)
    const { data: ip } = await sb.from('internal_parts').select('part_type,dx,dy,dz,x,y,z,sort_order').eq('cabinet_instance_id', c.id)
    console.log('\n' + c.label); for (const p of cp) console.log(' case', JSON.stringify(p)); for (const p of ip ?? []) console.log(' int', JSON.stringify(p))
  }
}
if (what === 'cab') { const { data } = await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', process.argv[3]).single(); console.log(JSON.stringify(data, null, 0).slice(0, +process.argv[4] || 6000)) }
process.exit(0)
