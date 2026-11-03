// Temp: RHK6586 kitchenette rev 7 (Mark 2026-10-28): kick face under the integrated DW (face only, top edge taped).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) throw error }
const { error } = await sb.from('cabinet_instances').update({ has_toekick: true, toe_type: 'leg', pos_z: 0, dy: 880,
  notes: 'INTEGRATED DW door - Miele G5481SCVi 45cm. Kick face only below it (fixed to the DW plinth), between the mitred kick returns either side' })
  .eq('room_id', 'a496c328-cfda-4f74-8c6d-175edd8e5907').eq('label', 'BC-04')
console.log(error ? 'ERR ' + error.message : 'ok BC-04')
