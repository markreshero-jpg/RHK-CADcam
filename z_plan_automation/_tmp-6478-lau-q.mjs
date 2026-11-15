import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data } = await sb.from('cabinet_instances').select('*').eq('room_id', 'fc12bc7d-53ee-46ee-a302-3411f5129bcc').in('label', ['TC-07', 'TC-08'])
for (const c of data) { const o = { ...c }; for (const k of Object.keys(o)) if (o[k] == null || (typeof o[k] === 'object' && !Object.keys(o[k]).length)) delete o[k]; console.log(JSON.stringify(o, null, 0).slice(0, 3000)); console.log('---') }
process.exit(0)
