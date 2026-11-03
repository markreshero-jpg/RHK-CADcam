// RHK6478 Dune: create the project (defaults cloned from RHK6590, 2 Pac Flat 18mm) + a "Push To Open" handle schedule (no rows = no handles).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const NAME = 'RHK6478 Dune - 10 Wavecrest Dr, Castaways Beach'
let { data: p } = await sb.from('projects').select('id').eq('name', NAME).maybeSingle()
if (!p) {
  const { data: tpl } = await sb.from('projects').select('*').eq('id', '7032a6fe-be8c-499c-8ff8-315dfd61e790').single()
  const { id, created_at, updated_at, name, job_number, client_name, client_address, client_id, notes, nest_run_seq, ...defaults } = tpl
  const r = await sb.from('projects').insert({ ...defaults, name: NAME, job_number: 'RHK6478', client_name: 'Dune',
    client_address: '10 Wavecrest Dr, Castaways Beach', notes: 'Created by draw-plan automation. Floor allowance 20 (TBC) - site CH measured off slab.' }).select('id').single()
  if (r.error) { console.log('project', r.error.message); process.exit(1) }
  p = r.data
}
console.log('project', p.id)
let { data: hs } = await sb.from('handle_schedules').select('id').eq('name', 'Push To Open').maybeSingle()
if (!hs) {
  const r = await sb.from('handle_schedules').insert({ name: 'Push To Open' }).select('id').single()
  if (r.error) { console.log('handle schedule', r.error.message); process.exit(1) }
  hs = r.data
}
console.log('pto schedule', hs.id)
