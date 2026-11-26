// RHK6586 Sliding Door Patches: title note above the TC-01 carrier on the Wall 2 elevation.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = 'af81945a-35e3-4de1-9342-8593ad96d376'
const w2 = chk('w', await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single())
if (chk('a', await sb.from('room_annotations').select('id').eq('room_id', R).eq('view', 'elevation')).length) { console.log('already has elevation CAD'); process.exit(0) }
chk('note', await sb.from('room_annotations').insert({ room_id: R, wall_id: w2.id, wall_side: 'face', view: 'elevation', kind: 'text', sort_order: 1,
  style: { size: 3.5, align: 'center', lineSpacing: 1.4 }, geom: { at: { x: 100, y: -(615 + 260) }, width: 62 },
  text: 'SLIDING DOOR PATCHES\nQTY x30\n95W x 115H, ARCH TOP R47.5\n3mm MDF' }))
console.log('ok'); process.exit(0)
