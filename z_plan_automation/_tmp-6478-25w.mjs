// RHK6478 Darby 2026-11-11: 2pac colour = Dulux White Beach Quarter (25W).
// New row on the 2 Pac Satin 18mm range (the TBC row is shared with RHK6563 - left alone);
// swaps TBC -> new on the project, rooms and any cabinet JSON in Dune only. DRY=1 lists only.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const DRY = !!process.env.DRY
const P = 'fa0884a2-abd1-4370-adfa-a30044e88ef2', RANGE = 'bec37dbd-7fd1-44c7-acc1-38c74981e059', TBC = '827dfe38-7cb7-4c02-aa87-6916b09876f5'
const NAME = 'Dulux White Beach Quarter'
const { data: tpl } = await sb.from('door_schedule_materials').select('*').eq('id', TBC).single()
const { data: dflt } = await sb.from('door_schedule_materials').select('colour_name,finish').eq('id', '651a3032-d6c1-455c-898e-d61beeab26f6').single()
console.log('range default', dflt)
let { data: row } = await sb.from('door_schedule_materials').select('id').eq('schedule_id', RANGE).eq('colour_name', NAME).maybeSingle()
if (!row && !DRY) {
  const { id, created_at, updated_at, ...rest } = tpl
  const r = await sb.from('door_schedule_materials').insert({ ...rest, colour_name: NAME, colour_code: '25W', brand: 'Dulux', finish: dflt.finish, sort_order: 91 }).select('id').single()
  if (r.error) { console.log(r.error.message); process.exit(1) }
  row = r.data
}
const NEW = row?.id ?? 'NEW'
console.log('new colour', NEW)
const swapObj = o => { const n = {}; for (const [k, v] of Object.entries(o)) if (v === TBC) n[k] = NEW; return n }
const { data: proj } = await sb.from('projects').select('*').eq('id', P).single()
const pu = swapObj(proj); console.log('project', Object.keys(pu))
if (!DRY && Object.keys(pu).length) console.log((await sb.from('projects').update(pu).eq('id', P)).error?.message ?? 'ok')
const { data: rooms } = await sb.from('rooms').select('*').eq('project_id', P)
for (const r of rooms) {
  const ru = {}
  for (const [k, v] of Object.entries(r)) {
    if (v === TBC) ru[k] = NEW
    else if (v && typeof v === 'object' && JSON.stringify(v).includes(TBC)) ru[k] = JSON.parse(JSON.stringify(v).replaceAll(TBC, NEW))
  }
  if (Object.keys(ru).length) { console.log('room', r.name, Object.keys(ru)); if (!DRY) console.log((await sb.from('rooms').update(ru).eq('id', r.id)).error?.message ?? 'ok') }
  const { data: cabs } = await sb.from('cabinet_instances').select('*').eq('room_id', r.id)
  for (const c of cabs ?? []) {
    const cu = {}
    for (const [k, v] of Object.entries(c)) {
      if (v === TBC) cu[k] = NEW
      else if (v && typeof v === 'object' && JSON.stringify(v).includes(TBC)) cu[k] = JSON.parse(JSON.stringify(v).replaceAll(TBC, NEW))
    }
    if (Object.keys(cu).length) { console.log('  cab', r.name, c.label, Object.keys(cu)); if (!DRY) console.log('  ', (await sb.from('cabinet_instances').update(cu).eq('id', c.id)).error?.message ?? 'ok') }
  }
}
process.exit(0)
