// RHK6595 (Mark 2026-11-11): bulkhead colour confirmed -> delete the two TBC clouds (Mark named them), notes = colour + arrow,
// moved from "Questions for Client" to General. "BULKHEAD OVERSIZED - CUT ON SITE" (site note) kept.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const GENERAL = 'd189db92-71d7-47fb-adcc-425cc8a2eac4'
const CLOUDS = ['0e5b34e1-e72a-460f-9331-72633cbb8aae', '9648670e-e2ed-4552-adf5-a086d5c609b9']
const ok = (l, r) => console.log(l, r.error?.message ?? 'ok')
const before = (await sb.from('room_annotations').select('*').in('id', [...CLOUDS, 'ec2e0972-a958-482b-9334-d50c2f943ad1', 'b08162ee-bd7d-4b62-b62e-99080bf603ee'])).data
fs.writeFileSync('z_plan_automation/_tmp-6595-bhclean-before.json', JSON.stringify(before, null, 1))
let r = await sb.from('room_annotations').delete().in('id', CLOUDS).select('id')
if (r.error || r.data.length !== 2) { console.log('plain delete', r.error?.message ?? `${r.data.length} rows`, '-> force_delete_annotations (Mark named these)'); r = await sb.rpc('force_delete_annotations', { ids: CLOUDS }) }
ok('clouds deleted', r)
ok('Wall 2 note', await sb.from('room_annotations').update({ text: 'BULKHEADS SUBLIME TEAK 18', cad_layer_id: GENERAL }).eq('id', 'ec2e0972-a958-482b-9334-d50c2f943ad1'))
const w4 = before.find(a => a.id.startsWith('b08162ee'))
ok('Wall 4 note', await sb.from('room_annotations').update({ text: 'BULKHEAD SUBLIME TEAK 18', cad_layer_id: GENERAL,
  geom: { ...w4.geom, leader: [{ x: 800, y: -2350 }, { x: 960, y: -2410 }] } }).eq('id', w4.id))
console.log('left', JSON.stringify((await sb.from('room_annotations').select('id').in('id', CLOUDS)).data))
