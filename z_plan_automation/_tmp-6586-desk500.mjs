// Temp: RHK6586 study desk 600 -> 500 deep (top, left panels, panel/drawer depths) + 500 plan dim.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd4fdad8f-bcbf-4c38-a6ad-b6e0cee7ca8d', TOP = '6c7a2b4c-dedd-4b00-9c49-12b95e349916', D = 500
const chk = (l, r) => console.log(l, r.error ? 'ERR ' + r.error.message : 'ok ' + (r.data?.length ?? ''))
const { data: top } = await sb.from('benchtop_instances').select('polygon,segments,notes').eq('id', TOP).single()
const mv = p => ({ x: p.x === 600 ? D : p.x, y: p.y === 600 ? D : p.y })
const polygon = top.polygon.map(mv), segments = top.segments.map(s => ({ ...s, p0: mv(s.p0), p1: mv(s.p1) }))
console.log(JSON.stringify(polygon))
chk('top', await sb.from('benchtop_instances').update({ polygon, segments, notes: top.notes.replace('600 deep', '500 deep') }).eq('id', TOP).select('id'))
for (const [label, set] of [['BC-05', { pos_x: 500, dz: 482 }], ['BC-06', { pos_x: 516.5, dz: 482 }], ['BC-01', { dz: 482 }], ['BC-02', { dz: 482 }], ['BC-03', { dz: 460 }]])
  chk(label, await sb.from('cabinet_instances').update(set).eq('room_id', R).eq('label', label).select('id'))
const { data: have } = await sb.from('room_annotations').select('id').eq('room_id', R).eq('view', 'plan').eq('kind', 'dim')
console.log('existing plan dims', have.length)
chk('dim', await sb.from('room_annotations').insert({ room_id: R, view: 'plan', kind: 'dim', geom: { p1: { x: 1100, y: 0 }, p2: { x: 1100, y: D }, axis: 'y', offset: 0 }, style: {}, sort_order: 40 }).select('id'))
