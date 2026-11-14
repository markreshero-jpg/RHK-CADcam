import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const r = await sb.from('cabinet_definitions').select('name,assembly_class,default_dx,default_dy,default_dz,face_grid,internal_grid').in('name', ['T2D', 'T1D', 'D4-SSSL', 'D4', 'D3', 'B1D', 'TEPF', 'TFKW', 'WUP', 'BH', 'TEPK', 'W2D', 'BEPF', 'D1'])
for (const d of r.data) console.log(d.name, d.assembly_class, d.default_dx, d.default_dy, d.default_dz, JSON.stringify(d.face_grid).slice(0, 200), JSON.stringify(d.internal_grid).slice(0, 200))
const s = await sb.from('hardware_slides').select('id,name,length,height').ilike('name', 'Dragon Pro%x95%'); console.log(s.data)
