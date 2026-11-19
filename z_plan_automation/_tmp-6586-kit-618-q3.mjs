import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ID='b5a2e6b5-1cc5-4a3b-a5e3-08181b770137'
const c=(await sb.from('cabinet_instances').select('*').eq('id',ID).single()).data
for(const [k,v] of Object.entries(c)) if(v&&typeof v==='object'&&JSON.stringify(v).includes('"back"')||(typeof v==='object'&&v&&/back/.test(JSON.stringify(v))&&k!=='footprint')) console.log('col',k,JSON.stringify(v).slice(0,300))
for(const t of ['part_operations','part_shape_overrides','part_hide','cabinet_part_overrides','part_edge_overrides']){const r=await sb.from(t).select('*').eq('cabinet_instance_id',ID);if(!r.error&&r.data.length)console.log(t,JSON.stringify(r.data.map(x=>Object.fromEntries(Object.entries(x).filter(([k,v])=>v!=null&&!/created|updated/.test(k))))).slice(0,600));else if(r.error)console.log(t,'n/a')}
