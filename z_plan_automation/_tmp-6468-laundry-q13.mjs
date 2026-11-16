import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '874fed25-8e1b-4bbf-b1ff-3090361b5dad'
const one = (await sb.from('fixture_catalog').select('*').limit(1)).data[0]
console.log('COLS', Object.keys(one).join(','))
const all = (await sb.from('fixture_catalog').select('*')).data
console.log('CAT', JSON.stringify(all.filter(r => /wine|vintec/i.test(JSON.stringify(r))).map(r => ({ id: r.id, name: r.name, cat: r.category, w: r.width, d: r.depth, h: r.height, active: r.active }))))
const a = (await sb.from('room_annotations').select('id,view,kind,geom,text,style,cad_layer_id').eq('room_id', R)).data
for (const r of a.filter(r => !r.geom?.freehand)) console.log(r.id.slice(0,8), r.view, r.kind, JSON.stringify(r.geom).slice(0, 160), JSON.stringify(r.text)?.slice(0, 120), r.style?.src ?? '')
const c = (await sb.from('cabinet_instances').select('label,pos_x,dx,dy,dz,pos_z,bulkhead,notes').eq('room_id', R).order('label')).data
for (const x of c) console.log(x.label, x.pos_x, x.dx, x.dy, x.dz, x.pos_z, JSON.stringify(x.bulkhead ?? null), x.notes ?? '')
console.log(JSON.stringify((await sb.from('benchtop_instances').select('id,polygon').eq('room_id', R)).data))
