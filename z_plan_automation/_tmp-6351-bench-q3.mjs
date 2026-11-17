import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const m = await sb.from('materials').select('id,name,dz,dx,dy,parent_id,is_default_colour,colour_name').or('name.ilike.%woodmatt%,name.ilike.%tasman%'); console.log('materials', JSON.stringify(m.data ?? m.error, null, 0))
const dsm = await sb.from('door_schedule_materials').select('id,schedule_id,colour_name,material_id,edgeband_id').or('colour_name.ilike.%woodmatt%,colour_name.ilike.%tasman%'); console.log('dsm', JSON.stringify(dsm.data ?? dsm.error))
const ds = await sb.from('door_styles').select('*').or('name.ilike.%16%,name.ilike.%polytec%'); console.log('styles', JSON.stringify((ds.data??[]).map(s=>({id:s.id,name:s.name,sched:s.schedule_id??s.door_schedule_id, cat:s.door_catalogue_id}))))
const eb = await sb.from('edgebands').select('id,name').ilike('name', '%woodmatt%'); console.log('eb', JSON.stringify(eb.data ?? eb.error))
