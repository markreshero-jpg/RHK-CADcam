// RHK6592 (Mark 2026-11-01): BC-11 top 2 drawer fronts = BC-08's (180), bottom drawer takes the rest.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const cabs = (await sb.from('cabinet_instances').select('id,label,dz,face_grid').eq('room_id', 'dc7a22f3-ed0b-4771-a42e-4548fc4de1e1').in('label', ['BC-08', 'BC-11'])).data
for (const c of cabs) console.log(c.label, JSON.stringify(c.face_grid))
if (process.argv[2] === 'go') {
  const c = cabs.find(x => x.label === 'BC-11'), fg = c.face_grid
  const H = Number(process.argv[3])
  fg.rows = fg.rows.map(r => r.row_index === 0 ? { ...r, height: undefined, height_locked: false } : { ...r, height: H, height_locked: true })
  const r = await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id)
  console.log(r.error?.message ?? 'ok', JSON.stringify(fg.rows))
}
