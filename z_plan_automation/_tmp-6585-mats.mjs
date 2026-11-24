// RHK6585: base "exposed" board (end panels / fillers) = PT Classic White Matt in the Media Unit + Pantry rooms.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const CWM = 'fcfa8ede-490a-4dfc-bee9-42923d1e9c0f'
for (const room_id of ['e0e96be3-7615-413c-b4f8-2a07c728ec39', '7b416272-2861-4bf8-a60f-94f5632aa439']) {
  const have = (await sb.from('room_materials').select('id').eq('room_id', room_id).eq('assembly_class', 'base').eq('material_role', 'exposed')).data
  if (have.length) { console.log('already set', room_id); continue }
  const r = await sb.from('room_materials').insert({ room_id, assembly_class: 'base', material_role: 'exposed', material_id: CWM })
  console.log(room_id, r.error?.message ?? 'inserted')
}
process.exit(0)
