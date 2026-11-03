// RHK6592: library sink + tap on a sink cupboard.  node _tmp-6592-sink.mjs <roomId> <wallName> <cupboardCentreX> <benchHeight> <slab>
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) throw error }
const [ROOM, WALL, CX, BENCH, T] = process.argv.slice(2); const cx = +CX, bench = +BENCH, t = +T
const SINK = 'ab1c3583-04c1-4105-aa8c-8cf2c54574a5', TAP = 'c8170123-0e37-437c-a3d0-36e091b5c589'
const { data: [w] } = await sb.from('walls').select('id').eq('room_id', ROOM).eq('name', WALL)
const { data: [any] } = await sb.from('room_fixtures').select('*').limit(1)
const cols = Object.keys(any)
const { data: cat } = await sb.from('fixture_catalog').select('*').in('id', [SINK, TAP])
const fromCat = (c, extra) => {
  const row = { room_id: ROOM, catalog_id: c.id, wall_id: w.id, rotation: 0, display_name: c.name }
  for (const k of cols) if (k in c && !['id', 'created_at', 'updated_at', 'room_id', 'wall_id'].includes(k) && !(k in row)) row[k] = c[k]
  return { ...row, ...extra }
}
const sinkC = cat.find(c => c.id === SINK), tapC = cat.find(c => c.id === TAP)
const drop = Number(sinkC.height) + t
const sink = fromCat(sinkC, { x: Math.round((cx - sinkC.width / 2) * 10) / 10, y: 80, z: bench - drop, bench_drop: drop })
const tap = fromCat(tapC, { x: Math.round((cx - tapC.width / 2) * 10) / 10, y: 15, z: bench })
const ins = await sb.from('room_fixtures').insert([sink, tap]).select('id,name,x,y,z')
if (ins.error) throw ins.error
console.log(JSON.stringify(ins.data))
