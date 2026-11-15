// RHK6586 2026-11-15: WC-09 under panel cut-outs mirrored? read-only query.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: cp } = await sb.from('cabinet_custom_parts').select('*').eq('id', 'e665c0c4-dcd2-4a1d-99b1-c6bd25207046').single()
console.log(JSON.stringify(cp, null, 1))
const { data: cab } = await sb.from('cabinet_instances').select('id,cabinet_code,label,wall_id,pos_x,pos_y,pos_z,rotation,dx,dy,dz,part_cutouts,part_pos_overrides,part_shape_overrides,updated_at').eq('id', cp.cabinet_instance_id).maybeSingle()
console.log(JSON.stringify(cab, null, 1))
const { data: ops } = await sb.from('part_operations').select('id,source_table,source_cabinet_id,source_part_key,operation_type,plane_kind,output_face,pos_x,pos_y,size_dx,size_dy,length,depth').in('source_cabinet_id', ['603f5150-1008-42b2-9d25-b61b0de40d6c', '089fd47b-6cba-4d69-88b2-9f5640331095'])
console.log(JSON.stringify(ops))
const { data: all } = await sb.from('part_operations').select('source_cabinet_id,source_table,plane_kind,output_face,operation_type,depth').in('operation_type', ['route', 'groove']).eq('plane_kind', 'face_back').is('output_face', null).limit(200)
console.log('face_back routes/grooves with null output_face:', all?.length, JSON.stringify([...new Set((all ?? []).map(o => o.source_cabinet_id))]))
