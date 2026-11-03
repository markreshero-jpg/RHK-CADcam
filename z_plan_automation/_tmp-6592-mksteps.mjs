import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data } = await sb.from('cabinet_instances').select('label,dz,dy,pos_z').eq('room_id', process.argv[2]).order('label')
console.log(data.map(c => `${c.label} dy${c.dy} dz${c.dz} z${c.pos_z}`).join(' | '))
fs.writeFileSync('z_plan_automation/_tmp-6592-steps.json', JSON.stringify(data.filter(c => !/^KICK/.test(c.label)).map(c => ['updateCabinet', [c.label, { dz: Number(c.dz) }]])))
