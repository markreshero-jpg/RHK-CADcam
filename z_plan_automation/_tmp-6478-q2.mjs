import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data } = await sb.from('cabinet_definitions').select('*').in('cv_code', ['TFFW','TFF','T1D','T2D','TFKW'])
const { error: e1 } = await sb.from('cabinet_definitions').select('*').limit(1); console.log(e1?.message); console.log(JSON.stringify(data?.map(d=>({code:d.code,name:d.name,cls:d.assembly_class,tk:d.has_toekick}))))
const { data: c } = await sb.from('cabinet_instances').select('label,part_hide_views').not('part_hide_views','is',null).limit(200)
console.log(JSON.stringify(c.filter(x => Object.keys(x.part_hide_views ?? {}).length).slice(0,3)))
