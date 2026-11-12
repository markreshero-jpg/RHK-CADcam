// RHK6339 J07 (Mark 2026-11-12): WC-02 was shortened to start at the beam (offset 147, 3550 long), so the LED route
// (pos_y = along the top from ITS left end) moved 147 right of the open shelves. Re-centre on WC-01 (960-2977):
// pos_y = 1968.5 - WC-02's start. Reads both positions so it stays right if either moves again.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef'
const c = (await sb.from('cabinet_instances').select('id,label,pos_y,dx').eq('room_id', R).in('label', ['WC-01', 'WC-02'])).data
const top = c.find(x => x.label === 'WC-02'), open = c.find(x => x.label === 'WC-01')   // Wall 3 runs +y, so pos_y = offset
const centre = Number(open.pos_y) + Number(open.dx) / 2 - Number(top.pos_y)
const r = await sb.from('part_operations').update({ pos_y: centre, size_dy: Number(open.dx) }).eq('source_cabinet_id', top.id).eq('operation_type', 'route').select('id,pos_x,pos_y,size_dy')
console.log('top starts', top.pos_y, 'route centre', centre, '->', JSON.stringify(r.data), r.error?.message ?? '')
console.log('route along the wall', Number(top.pos_y) + centre - Number(open.dx) / 2, '-', Number(top.pos_y) + centre + Number(open.dx) / 2)
