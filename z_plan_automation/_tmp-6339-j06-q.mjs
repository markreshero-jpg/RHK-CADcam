import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const P = 'cf31069b-1a56-49ee-91df-dade35f68fde'
const j = x => console.log(JSON.stringify(x))
const rooms = (await sb.from('rooms').select('*').eq('project_id', P)).data
for (const r of rooms) j({ id: r.id, name: r.name, wct: r.wall_cabinet_top, hs: r.handle_schedule_id, ro: r.rule_overrides, room_dy: r.room_dy })
j((await sb.from('benchtop_instances').select('label,height_mm,segments,joins,join_types,edge_tags,wall_side').eq('room_id', 'ab417075-b6e2-4189-93c5-c281e1f05f9b')).data)
j((await sb.from('benchtop_instances').select('label,joins,join_types,edge_tags').neq('joins', '[]').limit(2)).data)
j((await sb.from('materials').select('id,name,dz').or('name.ilike.Veneer 33%,name.ilike.Veneer 17%')).data)
j((await sb.from('cabinet_definitions').select('id,name,assembly_class').in('name', ['T2D', 'B2D', 'B1D', 'TFKW', 'BH', 'W2D', 'WOPN', 'B2'])).data)
j((await sb.from('hardware_handles').select('id,name').ilike('name', '%timber%')).data)
