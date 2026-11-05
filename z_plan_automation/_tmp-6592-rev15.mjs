// RHK6592 rev 15 (Mark 2026-11-05): bathroom wall fillers on edge — main bath TC-01 + BC-05, ensuite BC-01. Was a 16 wide
// flat face strip; now a 70 wide board on edge (orientation side: 16.5 thick across, 70 deep), front flush with the old
// face (z = cab.d + 2 + t - 70). Front long edge (right, as case sides) + top taped.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (m, r) => { if (r.error) throw new Error(m + ': ' + r.error.message); console.log('ok', m); return r.data }
const parts = { 'd827900c-f8ed-4d24-b5cf-8d8f5c032e27': 300, 'af42c2a6-8ad7-4d4c-8a9b-d88ba68d69bd': 455, '62b65e52-163b-4562-b191-683368f58d5b': 455 }
for (const [id, d] of Object.entries(parts)) chk('filler ' + id.slice(0, 4), await sb.from('cabinet_custom_parts').update({
  orientation: 'side', x: 0, z: d + 2 + 16.5 - 70, dx: 70, dz: 16.5,
  expressions: { y: 'cab.kick', z: 'cab.d + 2 + t.exposed - 70', dx: '70', dy: 'cab.h - cab.kick', dz: 't.exposed' },
  edge_top: true, edge_bottom: false, edge_left: false, edge_right: true,
}).eq('id', id))
