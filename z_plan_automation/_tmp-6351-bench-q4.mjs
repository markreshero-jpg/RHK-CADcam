import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const m = await sb.from('materials').select('id,name,dz,parent_id,colour_name').or('name.ilike.%woodmatt%,name.ilike.%tasman%,id.in.(6cd37f1b-67ce-4005-b5c3-c2715b739e07,28a7be0d-479f-4ca0-8f92-e4b6c6093d51)'); console.log('materials', JSON.stringify(m.data ?? m.error))
const s = await sb.from('door_schedules').select('*').in('id', ['476c0c69-7f18-4bb6-bf2c-262884219fdf','9c04b651-e76f-4822-a2dd-e716d3e6bfac','58622a66-9ac3-4725-82a6-be0ac00799ec']); console.log('sched', JSON.stringify(s.data ?? s.error))
const ds = await sb.from('door_styles').select('*').limit(1); console.log('stylecols', Object.keys(ds.data?.[0]??{}).join(','))
const eb = await sb.from('edge_banding').select('id,name').or('id.in.(02006b48-a0fd-40b2-ba4d-d024139f95c8,b8e838bc-1bd6-4786-a388-564be5b27f4d),name.ilike.%tas%'); console.log('eb', JSON.stringify(eb.data ?? eb.error))
