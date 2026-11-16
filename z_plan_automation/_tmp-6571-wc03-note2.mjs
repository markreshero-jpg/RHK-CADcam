// RHK6571 Kitchen: El C rangehood note up off the Benchtop 3 label (same move as _tmp-6571-wc03-note.mjs now makes).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const r = await sb.from('room_annotations').update({ geom: { at: { x: 851.5 - 400, y: -1330 }, width: 40 } }).eq('id', '28271d79-44aa-4eb1-9133-1439b85f001c')
console.log(r.error?.message ?? 'ok')
