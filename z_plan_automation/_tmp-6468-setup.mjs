import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
let p = chk('findp', await sb.from('projects').select('id,name,deleted_at').eq('job_number', 'RHK6468').maybeSingle())
if (!p) {
  const tpl = chk('tpl', await sb.from('projects').select('*').eq('job_number', 'RHK6351').single())
  const { id, created_at, updated_at, name, job_number, client_name, client_address, client_id, notes, nest_run_seq, deleted_at, ...d } = tpl
  p = chk('proj', await sb.from('projects').insert({ ...d, name: 'RHK6468 - Rya Projects - 28 Mossman Crt', job_number: 'RHK6468', client_name: 'Rya Projects', client_address: '28 Mossman Crt, Noosa Heads QLD', notes: null }).select('id,name').single())
}
let r = chk('findr', await sb.from('rooms').select('id,name').eq('project_id', p.id).eq('name', 'Kitchen').maybeSingle())
if (!r) r = chk('room', await sb.from('rooms').insert({ project_id: p.id, name: 'Kitchen', sort_order: 0, room_dy: 2400 }).select('id,name').single())
console.log(JSON.stringify({ project: p, room: r }))
