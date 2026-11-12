import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const j = x => console.log(JSON.stringify(x))
j((await sb.from('cabinet_definitions').select('*').in('name', ['WUP', 'TUP', 'BUP', 'FLSHLF'])).data?.map(d => ({ id: d.id, name: d.name, cls: d.assembly_class, desc: d.description, dx: d.default_dx, dy: d.default_dy, dz: d.default_dz })))
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef'
const c = (await sb.from('cabinet_instances').select('*').eq('room_id', R)).data
for (const x of c) j([x.label, x.pos_z, x.dx, x.dy, x.dz, x.offset, x.has_toekick, x.top_type, x.rule_overrides, x.material_overrides])
