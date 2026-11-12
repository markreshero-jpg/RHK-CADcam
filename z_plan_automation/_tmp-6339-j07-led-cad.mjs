// RHK6339 J07 (Mark 2026-11-12): LED route over the open shelves only - dimensioned on the Wall 3 elevation;
// LED by the electrician; jamb note. Insert / edit in place only.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef', GENERAL = '9768e64f-5133-4558-8375-b293405b976c'
const W3 = (await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 3').single()).data.id
const ann = (await sb.from('room_annotations').select('id,text,kind,geom,sort_order').eq('room_id', R)).data
let so = Math.max(0, ...ann.map(a => a.sort_order ?? 0))
const upd = async (pred, f) => { const a = ann.find(pred); const r = await sb.from('room_annotations').update(f(a)).eq('id', a.id); console.log(a.text.slice(0, 30), r.error?.message ?? 'ok') }
await upd(a => a.text?.startsWith('LED ROUTE'), a => ({ text: 'LED ROUTE 18.5 x 9 IN THE UNDERSIDE\nOVER THE OPEN SHELVES ONLY (2017)\nLF-9 LED SUPPLIED + FITTED BY ELECTRICIAN' }))
await upd(a => a.text?.startsWith('SITE NOTES'), a => ({ text: a.text.replace('TBC: LF-9 LED in the top route - by whom?', 'LF-9 LED in the top route: electrician supplies + fits.\nDoor jamb 31 x 220 on the 305 return: existing, by others.') }))
const E3 = { room_id: R, view: 'elevation', wall_id: W3, wall_side: 'face', cad_layer_id: GENERAL }
const rows = []
if (!ann.some(a => a.kind === 'dim' && a.geom?.p1?.x === 960)) rows.push({ ...E3, kind: 'dim', text: null, geom: { p1: { x: 960, y: -2227 }, p2: { x: 2977, y: -2227 }, axis: 'x', offset: 120 }, style: {} })
if (!ann.some(a => a.text?.startsWith('DOOR JAMB'))) rows.push({ ...E3, kind: 'text', text: 'DOOR JAMB 31 x 220\nEXISTING - BY OTHERS', geom: { at: { x: 3740, y: -1300 } }, style: { size: 2.5 } })
for (const r of rows) { const x = await sb.from('room_annotations').insert({ ...r, sort_order: ++so }).select('id').single(); console.log(r.kind, x.error?.message ?? x.data.id) }
