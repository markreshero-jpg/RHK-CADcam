// rev 8: move the "UNDERMOUNT SS SINK + HWU BY OTHERS" elevation note below the drawn sink and the size label (it sat over the sink label).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'b2252689-fdc9-4fd7-be9a-f29853f0391e'
const { data: ann } = await sb.from('room_annotations').select('id,text,geom').eq('room_id', R)
const s = ann.find(a => a.text?.startsWith('UNDERMOUNT'))
console.log('was', JSON.stringify(s.geom))
const r = await sb.from('room_annotations').update({ text: 'UNDERMOUNT SS SINK (MEMO HUGO COMPACT) + HOT WATER UNIT BY OTHERS', geom: { ...s.geom, at: { x: s.geom.at.x, y: -400 } } }).eq('id', s.id)
console.log(r.error?.message ?? 'ok')
