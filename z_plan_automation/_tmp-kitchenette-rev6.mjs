// Temp: RHK6586 kitchenette rev 6 (Mark 2026-10-28): library sink (single bowl U/M, under the 20 top) + pull-out mixer.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) throw error }
const ROOM = 'a496c328-cfda-4f74-8c6d-175edd8e5907', W2 = '5a091ee9-4581-4d8b-99b4-99827bb3af80'
const SINK = 'ab1c3583-04c1-4105-aa8c-8cf2c54574a5', TAP = 'c8170123-0e37-437c-a3d0-36e091b5c589'
const { data: [old] } = await sb.from('room_fixtures').select('*').eq('room_id', ROOM).eq('kind', 'Kitchen sink')
const cols = Object.keys(old)
const { data: cat } = await sb.from('fixture_catalog').select('*').in('id', [SINK, TAP])
const fromCat = (c, extra) => {
  const row = { room_id: ROOM, catalog_id: c.id, wall_id: W2, rotation: 0, display_name: c.name }
  for (const k of cols) if (k in c && !['id', 'created_at', 'updated_at', 'room_id', 'wall_id'].includes(k) && !(k in row)) row[k] = c[k]
  return { ...row, ...extra }
}
const BENCH = 900, T = 20
const sinkC = cat.find(c => c.id === SINK), tapC = cat.find(c => c.id === TAP)
const cxSink = 1303 + 615.5 / 2                      // sink cupboard centre
const drop = Number(sinkC.height) + T                 // undermount: rim under the 20 top
const sink = fromCat(sinkC, { x: Math.round((cxSink - sinkC.width / 2) * 10) / 10, y: 80, z: BENCH - drop, bench_drop: drop })
const tap = fromCat(tapC, { x: Math.round((cxSink - tapC.width / 2) * 10) / 10, y: 15, z: BENCH })
console.log('sink', sink.x, sink.y, sink.z, 'tap', tap.x, tap.y, tap.z)
const ins = await sb.from('room_fixtures').insert([sink, tap]).select('id,name')
if (ins.error) throw ins.error
console.log('inserted', ins.data)
const del = await sb.from('room_fixtures').delete().eq('id', old.id).select('id')
console.log(del.error ? 'ERR ' + del.error.message : 'deleted old sink ' + del.data.length)
