// RHK6478 WIP: part_operations, custom part orientations, definition names
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,cabinet_definition_id,part_cutouts').eq('room_id', 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae')
const { data: defs } = await sb.from('cabinet_definitions').select('id,name').in('id', cabs.map(c => c.cabinet_definition_id).filter(Boolean))
for (const c of cabs) console.log(c.label, defs.find(d => d.id === c.cabinet_definition_id)?.name ?? '-', c.part_cutouts ? JSON.stringify(c.part_cutouts).slice(0, 200) : '')
const { data: ops } = await sb.from('part_operations').select('source_cabinet_id,source_part_key,operation_type,pos_x,pos_y,length,width,depth,expressions:parameters').in('source_cabinet_id', cabs.map(c => c.id))
for (const o of ops ?? []) console.log('OP', cabs.find(c => c.id === o.source_cabinet_id).label, JSON.stringify(o).slice(0, 400))
const { data: cps } = await sb.from('cabinet_custom_parts').select('cabinet_instance_id,name,orientation,x,y,z,dx,dy,dz,expressions').in('cabinet_instance_id', cabs.map(c => c.id))
for (const p of cps) console.log('CP', cabs.find(c => c.id === p.cabinet_instance_id).label, p.name, p.orientation, JSON.stringify(p.expressions))
process.exit(0)
