// RHK6478 WIP pre-nest verify: kick parts, inner drawer backs, fillers, members
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae'
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,pos_x,pos_z,dx,dy,has_toekick,kick_run_id,rule_overrides').eq('room_id', R).order('label')
const by = l => cabs.find(c => c.label === l)
for (const l of ['TC-01', 'TC-02', 'BC-01', 'BC-02', 'WC-02', 'WC-03', 'TC-04', 'BC-04', 'TC-05', 'TC-06', 'KICK 1', 'KICK 2']) { const c = by(l); console.log(l, 'x', c.pos_x, 'z', c.pos_z, c.dx, 'x', c.dy, 'toe', c.has_toekick, 'run', c.kick_run_id?.slice(0, 4), JSON.stringify(c.rule_overrides ?? {})) }
const { data: tk } = await sb.from('toekick_parts').select('*').in('cabinet_instance_id', [by('KICK 2').id, by('KICK 1').id])
for (const p of tk ?? []) console.log('KICK', cabs.find(c => c.id === p.cabinet_instance_id).label, p.part_key, 'dx', p.dx, 'dy', p.dy, 'dz', p.dz, 'x', p.x, 'z', p.z)
const { data: ip } = await sb.from('internal_parts').select('part_type,dx,dy,y,sort_order').eq('cabinet_instance_id', by('TC-05').id).like('part_type', 'inner_drawer_%').order('sort_order')
for (const p of ip) console.log('TC-05', p.part_type, p.dx, 'x', p.dy, 'y', p.y)
const { data: cp } = await sb.from('cabinet_custom_parts').select('cabinet_instance_id,name,orientation,x,y,z,dx,dy,dz,edge_right,edge_left,edge_top,edge_bottom').in('cabinet_instance_id', cabs.map(c => c.id))
for (const p of cp) console.log('CP', cabs.find(c => c.id === p.cabinet_instance_id).label, p.name, p.orientation, `x${p.x} y${p.y} z${p.z}`, `${p.dx}x${p.dy}x${p.dz}`, 'edges', ['top', 'bottom', 'left', 'right'].filter(k => p['edge_' + k]).join(','))
const { data: fp } = await sb.from('case_parts').select('cabinet_instance_id,part_key,dx,dy,y').in('cabinet_instance_id', [by('BC-01').id, by('BC-04').id]).like('part_key', 'fprail%')
for (const p of fp) { const c = cabs.find(x => x.id === p.cabinet_instance_id); console.log('RAIL', c.label, p.part_key, `${p.dx} high x ${p.dy} long`, 'AFF', c.pos_z + p.y, '-', c.pos_z + p.y + p.dx) }
process.exit(0)
