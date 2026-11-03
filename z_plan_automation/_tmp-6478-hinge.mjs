// RHK6478 US Hallway Linen: hinge 3 off the adj-shelf hole bank -> 1000 (100 over the fixed shelf top 900.5).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'b6377e60-bed3-4e5c-af80-7ea320db6ff5'
const H = [2474, 1880.5, 1000, 693.5, 100]
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,face_grid').eq('room_id', R).in('label', ['TC-02', 'TC-03'])
for (const c of cabs) {
  const fg = c.face_grid
  fg.zones = fg.zones.map(z => ({ ...z, hinges: H }))
  const { error } = await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id)
  console.log(c.label, error?.message ?? 'ok', JSON.stringify(fg.zones.map(z => [z.col_index, z.hinge_side])))
}
