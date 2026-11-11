// RHK6595 (Mark 2026-11-11): Wall 2 elevation dim, bench top (950) to the overhead under panel underside (1575) = 625.
// Placed under WC-04 (x = offset from the wall's east start). Layer / wall_side copied from the DW markup note on Wall 2.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', W2 = 'c1be3640-632d-4a30-94be-117287719f6d'
const ann = (await sb.from('room_annotations').select('*').eq('room_id', R).eq('wall_id', W2)).data
const ref = ann.find(a => a.id.startsWith('7abf847f'))
if (ann.some(a => a.kind === 'dim' && a.geom?.p2?.y === -1575)) throw new Error('dim already there')
const r = await sb.from('room_annotations').insert({
  room_id: R, view: 'elevation', wall_id: W2, wall_side: ref.wall_side, cad_layer_id: ref.cad_layer_id, kind: 'dim',
  geom: { p1: { x: 1080, y: -950 }, p2: { x: 1080, y: -1575 }, axis: 'y', offset: 0 }, text: null,
  style: { src: 'markup-std', size: 2.5, weight: 0.18, arrowEnd: 'closed_open', arrowSize: 1.5, arrowStart: 'closed_open' },
  sort_order: Math.max(...ann.map(a => a.sort_order ?? 0)) + 1,
}).select('id')
console.log('dim', r.error?.message ?? r.data[0].id, 'layer', ref.cad_layer_id, ref.wall_side)
