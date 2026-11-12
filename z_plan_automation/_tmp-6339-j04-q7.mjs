import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
for (const id of ['c0b01544', '2d62af70', 'ab1c3583']) {
  const { data } = await sb.from('fixture_catalog').select('*').like('id::text', id + '%')
  console.log(JSON.stringify(data?.[0] ?? (await sb.from('fixture_catalog').select('*').ilike('name', id === 'c0b01544' ? 'Undermount sink 400%' : id === '2d62af70' ? 'Abey Lucia Gooseneck%' : 'Abi Ohelu%')).data[0]))
}
// RHK6586 placement of the undermount sink, for reference
const { data: pf } = await sb.from('room_fixtures').select('*').ilike('name', 'Undermount sink 400%').limit(1)
console.log('placed', JSON.stringify(pf?.[0]))
