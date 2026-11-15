// RHK6571 Kitchen: tidy after _tmp-6571-appl.mjs - SITE NOTES below the longer Appliance block, El B sink cloud off the mixer, El C rangehood text fits its cloud, duplicate DW label out.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3'
const rows = chk('q', await sb.from('room_annotations').select('id,geom').eq('room_id', R))
const id = p => rows.find(r => r.id.startsWith(p)).id
const pts = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
const up = async (p, patch) => chk(p, await sb.from('room_annotations').update(patch).eq('id', id(p)))
await up('0c85e031', { geom: { at: { x: 6330, y: 3700 }, width: 75 } })                       // SITE NOTES
await up('d768c511', { geom: { pts: pts(30, -1010, 650, -1310) } })                          // El B sink cloud -> over BC-04's blind side
await up('a9533050', { geom: { at: { x: 340 - 280, y: -1265 }, width: 28 }, text: 'U/M SINGLE BOWL\nFIENZA KURO 68612\nPOSITION TBC ON SITE' })
await up('94fdc640', { geom: { pts: pts(540, -1060, 1165, -1450) } })                        // El C rangehood cloud
await up('28271d79', { text: 'WESTINGHOUSE WRR626SB\nSLIDE-OUT RANGEHOOD\nCUT-OUT + DUCT TBC' })
chk('del', await sb.from('room_annotations').delete().eq('id', id('8fa26281')))              // "LG XD4B24PS" twice in El B
console.log('ok')
