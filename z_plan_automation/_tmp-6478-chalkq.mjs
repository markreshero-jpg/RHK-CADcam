import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
for (const sid of ['e8128310-48ff-49c3-8c22-1e46e6d150f2', '476c0c69-7f18-4bb6-bf2c-262884219fdf']) {
  const { data } = await sb.from('door_schedule_materials').select('id,colour_name,finish,material_id,edgeband_id').eq('schedule_id', sid).limit(6)
  console.log(sid, JSON.stringify(data))
}
const { data: m } = await sb.from('materials').select('id,name,dz,parent_id,colour_name,brand,finish').or('name.ilike.%chalk%,name.ilike.%LX Colour%,name.ilike.%Laminex%16%,finish.ilike.%chalk%').limit(20)
console.log(JSON.stringify(m))
const { data: p } = await sb.from('materials').select('id,name,dz,brand,finish').eq('id', '267f01d3-20a8-486f-b400-769579ae6e18')
console.log('teak parent', JSON.stringify(p))
const { data: st } = await sb.from('door_styles').select('id,name,door_catalogue_id,door_material_schedule_id').in('name', ['Laminex 16mm Colour', 'Laminex 18mm ABS Grain'])
console.log(JSON.stringify(st))
const { data: proj } = await sb.from('projects').select('default_door_style_id,base_door_style_id,wall_door_style_id,tall_door_style_id,base_door_colour_id,wall_door_colour_id,tall_door_colour_id').eq('id', 'fa0884a2-abd1-4370-adfa-a30044e88ef2').single()
console.log(JSON.stringify(proj))
