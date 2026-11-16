// RHK6571 Kitchen: rangehood resolved (WC-03 = slide-out, duct above by others) - El C cloud out, note kept as a plain label; spec block duct line out.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3'
const rows = chk('q', await sb.from('room_annotations').select('id,text,cad_layer_id').eq('room_id', R))
const id = p => rows.find(r => r.id.startsWith(p)).id
const gen = chk('l', await sb.from('job_cad_layers').select('id').eq('project_id', '063b0eab-a769-4b7d-a93c-d73ed639b3d1').eq('name', 'General').single()).id
chk('del', await sb.from('room_annotations').delete().eq('id', id('94fdc640')))
chk('txt', await sb.from('room_annotations').update({ text: 'SLIDE-OUT RANGEHOOD\nWESTINGHOUSE WRR626SB', cad_layer_id: gen, geom: { at: { x: 851.5 - 400, y: -1330 }, width: 40 } }).eq('id', id('28271d79')))
const blk = rows.find(r => r.id.startsWith('5eb158bd'))
chk('blk', await sb.from('room_annotations').update({ text: blk.text.replace('Westinghouse WRR626SB 60cm slide-out, stainless\n+ Abey RHH6 horizontal ducting kit 150', 'Westinghouse WRR626SB 60cm slide-out, stainless\nDuct above the cabinet - by others') }).eq('id', blk.id))
console.log('ok')
