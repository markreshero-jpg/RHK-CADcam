// RHK6586 Lounge WC-01 (Mark 2026-11-19): floating shelf top -> PT Woodmatt 33mm Boston Oak (glued 2 x 16.5).
// New library boards copied from PT Woodmatt 36mm (parent) / its Blonde Oak child. case_parts.material_id on
// fs:top only (a re-resolve puts it back to 16.5 Boston Oak; dz stays 33 via part_pos_overrides).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const strip = r => { const o = { ...r }; for (const k of ['id', 'created_at', 'updated_at']) delete o[k]; return o }
const { data: ex } = await sb.from('materials').select('id,name').ilike('name', 'PT Woodmatt 33mm%')
if (ex.length) { console.log('exists', ex); process.exit(1) }
const { data: p36 } = await sb.from('materials').select('*').eq('id', 'c7576a55-c3fa-4a2f-b511-accf63649d5b').single()
const { data: boston } = await sb.from('materials').select('*').eq('id', 'bedd22d1-ea8c-4e8d-bf47-a8865de915a2').single()
const parent = await sb.from('materials').insert({ ...strip(p36), name: 'PT Woodmatt 33mm', dz: 33, notes: '2 x 16.5 PT Woodmatt laminated' }).select('id,name').single()
if (parent.error) { console.log(parent.error.message); process.exit(1) }
const child = await sb.from('materials').insert({ ...strip(p36), name: 'PT Woodmatt 33mm – Boston Oak Woodmatt', dz: 33, notes: '2 x 16.5 PT Woodmatt Boston Oak laminated',
  parent_id: parent.data.id, colour_name: 'Boston Oak Woodmatt', is_default_colour: true,
  face_colour: boston.face_colour, edge_colour: boston.edge_colour, back_colour: boston.back_colour,
  sheet_dx: 3100, sheet_dy: 1211, overridden: ['sheet_dx'] }).select('id,name,dz,sheet_dx,sheet_dy').single()
console.log(JSON.stringify(parent.data), child.error?.message ?? JSON.stringify(child.data))
const u = await sb.from('case_parts').update({ material_id: child.data.id }).eq('cabinet_instance_id', '4b1d32e8-bb7f-4831-9652-c240f352321f').eq('part_key', 'fs:top').select('part_key,dz,material_id')
console.log(u.error?.message ?? JSON.stringify(u.data))
