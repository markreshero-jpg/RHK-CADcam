// Temp: plan + front outlines for the White Semi Recessed Basin 530x360 (catalog + RHK6586 vanity instance).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) throw error }
const { plan, elev } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
let r = await sb.from('fixture_catalog').update({ plan_shape: plan, elev_shape: elev }).eq('id', 'a23d206f-44db-4848-bf28-d804bf587add').select('id')
console.log(r.error ? 'ERR ' + r.error.message : 'catalog ' + r.data.length)
r = await sb.from('room_fixtures').update({ plan_shape: plan, elev_shape: elev }).eq('id', '5193a04e-d9bc-4d5a-aef2-4fc5f763faed').select('id')
console.log(r.error ? 'ERR ' + r.error.message : 'instance ' + r.data.length)
