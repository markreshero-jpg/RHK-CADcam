import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '874fed25-8e1b-4bbf-b1ff-3090361b5dad'
const cabs = (await sb.from('cabinet_instances').select('id,label,face_grid').eq('room_id', R)).data
const lab = Object.fromEntries(cabs.map(c => [c.id, c.label]))
const cp = (await sb.from('cabinet_custom_parts').select('*').in('cabinet_instance_id', cabs.map(c => c.id))).data
console.log('CP keys', Object.keys(cp[0] ?? {}).join(','))
for (const p of cp) console.log(lab[p.cabinet_instance_id], p.name, p.material_id ?? p.material_role ?? '', JSON.stringify(p.expressions ?? {}).slice(0, 80))
for (const c of cabs) { const z = c.face_grid?.zones ?? []; const st = [...new Set(z.map(x => `${x.door_style_id ?? '-'}/${x.door_colour_id ?? '-'}`))]; if (z.length) console.log('FACE', c.label, st.join(' ')) }
