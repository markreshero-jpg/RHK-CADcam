// Temp: list RHK6586 cabinets that have drawers (face_grid zones of type drawer).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: rooms } = await sb.from('rooms').select('id,name').eq('project_id', 'bada385f-41cf-411e-9536-d1e413e6d5ce')
const out = []
for (const r of rooms) {
  const { data: cabs, error } = await sb.from('cabinet_instances').select('label,face_grid').eq('room_id', r.id)
  if (error) { console.log(error.message); continue }
  const labs = cabs.filter(c => /drawer/i.test(JSON.stringify(c.face_grid ?? ''))).map(c => c.label)
  console.log(r.name, labs.join(',')); if (labs.length) out.push(`${r.id}:${labs.join(',')}`)
}
console.log('ARGS', out.join(' '))
