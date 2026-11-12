// RHK6339 J07: CAD notes follow the pelmet -> 33 top change (edited in place).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef'
const ann = (await sb.from('room_annotations').select('id,text,geom').eq('room_id', R)).data
const upd = async (pred, f) => { const a = ann.find(pred); if (!a) return console.log('missing'); const r = await sb.from('room_annotations').update(f(a)).eq('id', a.id); console.log(a.text.split('\n')[0].slice(0, 30), r.error?.message ?? 'ok') }
await upd(a => a.text.startsWith('80 TIMBER PELMET'), a => ({ text: '33 VENEER BLACKBUTT TOP, FULL DEPTH 385\n80 PAST THE DOORS + OPEN SHELVES\nUNDERSIDE 2227 FFL (735 + 1492)', geom: { ...a.geom, at: { x: 1100, y: -2420 }, leader: [{ x: 1500, y: -2243 }, { x: 1500, y: -2330 }] } }))
await upd(a => a.text.startsWith('LF-9 LED'), a => ({ text: 'LED ROUTE 18.5 x 9 IN THE TOP UNDERSIDE, OVER THE OPEN SHELVES\nLF-9 LED BY WHOM - TBC', geom: { ...a.geom, at: { x: 1100, y: -2640 } } }))
await upd(a => a.text.startsWith('SPECIFICATIONS'), a => ({ text: a.text.replace('Kick + pelmet: Veneer Blackbutt', 'Kick: Veneer Blackbutt\nJ07 top: Veneer Blackbutt 33, full depth') }))
await upd(a => a.text.startsWith('SITE NOTES'), a => ({ text: a.text.replace('= 2227 FFL (talls + pelmet to the beam).', '= 2227 FFL = underside of the J07 33 top.').replace('TBC: LF-9 LED strip in the pelmet - by whom?', 'TBC: LF-9 LED in the top route - by whom?') }))
