import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data } = await sb.from('materials').select('id,name,brand,finish,dz,sheet_dx,sheet_dy,parent_id,colour_name,colour_code,notes,active').or('finish.ilike.%chalk%,name.ilike.%chalk%,colour_name.ilike.%teak%,id.in.(8fae4f9c-02aa-4799-a46d-52be445d247d,67ecbeff-98ac-41e1-9b1a-618a5bf6a96b,eaf4c4c1-bb55-4ac1-8b19-6d09b8c26c7b)')
for (const m of data) console.log(JSON.stringify(m))
// usage of teak materials in Dune
const P = 'fa0884a2-abd1-4370-adfa-a30044e88ef2'
const { data: rooms } = await sb.from('rooms').select('id,name').eq('project_id', P)
const rn = Object.fromEntries(rooms.map(r => [r.id, r.name]))
const { data: cabs } = await sb.from('cabinet_instances').select('id,room_id,label,code').in('room_id', rooms.map(r => r.id))
const cm = Object.fromEntries(cabs.map(c => [c.id, c]))
const ids = data.map(m => m.id)
const { data: cps } = await sb.from('cabinet_custom_parts').select('cabinet_instance_id,name,material_id,dz').in('cabinet_instance_id', cabs.map(c => c.id)).in('material_id', ids)
for (const p of cps ?? []) { const c = cm[p.cabinet_instance_id]; console.log('CP', rn[c.room_id], c.label ?? c.code, p.name, p.material_id.slice(0, 8), p.dz) }
process.exit(0)
