// RHK6339 J07: move the top + LED notes clear of the top (side by side above it).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef'
const ann = (await sb.from('room_annotations').select('id,text,geom').eq('room_id', R)).data
const upd = async (pred, f) => { const a = ann.find(pred); const r = await sb.from('room_annotations').update(f(a)).eq('id', a.id); console.log(a.text.slice(0, 30), r.error?.message ?? 'ok') }
await upd(a => a.text.startsWith('33 VENEER'), a => ({ geom: { ...a.geom, at: { x: 600, y: -2580 }, leader: [{ x: 1500, y: -2243 }, { x: 1500, y: -2385 }] } }))
await upd(a => a.text.startsWith('LED ROUTE'), a => ({ text: 'LED ROUTE 18.5 x 9 IN THE UNDERSIDE\nOVER THE OPEN SHELVES\nLF-9 LED BY WHOM - TBC', geom: { ...a.geom, at: { x: 2250, y: -2580 }, leader: [{ x: 2500, y: -2227 }, { x: 2500, y: -2385 }] } }))
