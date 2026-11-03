// Bath Linen room: mirror door style on the room's talls + lip pull handle schedule, before drawing re-resolves.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = process.argv[2]
console.log((await sb.from('rooms').update({ tall_door_style_id: '52cdbc14-e466-446b-9aa8-872d338cd202', tall_door_colour_id: 'd2d818ef-eadf-4e30-95db-d1a181efce70',
  handle_schedule_id: '733fe9b4-ecf4-491c-b043-88884b187053' }).eq('id', R)).error?.message ?? 'room ok')
