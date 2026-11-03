// Shop default hanging rail -> Nikpol OVALRODALUM (Mark 2026-11-03). Same 15 x 30 profile, model unchanged.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const r = await sb.from('hardware_accessories').update({
  name: 'Nikpol Oval Wardrobe Rod 15 x 30 Matte Aluminium 4m',
  brand: 'Nikpol',
  supplier_code: 'OVALRODALUM',
  finish: 'Matte aluminium',
  stock_length_mm: 4000,
  notes: 'Nikpol OVALRODALUM (Mark 2026-11-03; was Finista 7104016 chrome). Oval wardrobe rod, 15 x 30 x 1.2 wall, 4.0m, aluminium matte, easy to cut; box of 10 available; suits OVALFLANGECH / OVALFLANGECOVERCH. https://www.nikpol.com.au/ovalrodalum . Price: login to view. Model + supports still the Finista ones. Rail stops 5 short of each panel: cut length = clear opening - 10.',
}).eq('id', 'ac71b672-c456-405a-934b-a06ae1c440cc').select('name,supplier_code,stock_length_mm')
console.log(r.error?.message ?? JSON.stringify(r.data))
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a'
const s = (await sb.from('room_annotations').select('id,text').eq('room_id', R).like('text', 'SPECIFICATIONS%').single()).data
console.log((await sb.from('room_annotations').update({ text: s.text.replace(/Hanging rails:.*$/m, 'Hanging rails: Nikpol OVALRODALUM oval matte aluminium') }).eq('id', s.id)).error?.message ?? 'spec ok')
