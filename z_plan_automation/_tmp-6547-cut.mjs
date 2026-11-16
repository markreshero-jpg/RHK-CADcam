// RHK6547 Laundry rev 5 (Mark 2026-11-16): sink cuts the stone top (stone by others, never machined by us).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ok = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '20601f2b-4fa7-49c1-bfff-36d1d53ed308', OHELU = 'ab1c3583-04c1-4105-aa8c-8cf2c54574a5'
ok('sink', await sb.from('room_fixtures').update({ cut_benchtop: true, label: 'Single bowl sink 450 x 450 (cut-out in the stone, by others)' }).eq('room_id', R).eq('catalog_id', OHELU))
console.log(JSON.stringify(ok('fx', await sb.from('room_fixtures').select('label,x,y,width,depth,cutout_w,cutout_d,cut_benchtop').eq('room_id', R))))
process.exit(0)
