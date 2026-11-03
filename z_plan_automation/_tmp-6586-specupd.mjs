// Temp: RHK6586 spec block updates after Ben Flint's answers (Mark 2026-10-31).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const RAIL = 'Finger pull rails: Boston Oak, paint Metallic colour - TBC'
const edits = {
  'acb18523-deba-4342-b626-25cf900bae68': [
    ['Study desk 20mm stone, 45 deg waterfall end.', 'Study desk 40 finished (20mm stone + 40 mitred apron), 500 deep, 45 deg waterfall end.'],
    ['Push to open doors, finger pull drawers', 'Push to open doors, finger pull drawers\n' + RAIL],
  ],
  '4b115646-5599-4acd-abdb-6c0350dbd3d7': [
    ['20mm stone, 5 overhang', '40 finished (20mm stone + 40 mitred apron), 5 overhang'],
    ['Locks on all fronts', 'Locks on all fronts\n' + RAIL],
    ['LED Extrusion - Black Recessed', 'LED uplight: black recessed extrusion (RHK supply) in ledge route 19W x 9D, 50 from front'],
  ],
  '0d976ba5-ff4d-4d0c-a1f4-4f30d30efa41': [
    ['20mm stone + 150mm mitred apron (front + RH end), 785 top.', '20mm stone + 60mm mitred apron (front + RH end), 795 top.'],
    ['Finger pull drawers', 'Finger pull drawers\n' + RAIL],
    ['Sits on 200H tiled plinth by builder', 'Sits on 210H tiled plinth by builder (confirm on site)'],
    ['Runners: {runners}', 'Runners: {runners}\nLED: black surface-mount extrusion on the underside at front (lights floor)'],
  ],
  'db997e16-1901-4f9b-94fd-f9d97b1ea45e': [
    ['Bulkhead 200 flush with doors', 'Bulkheads painted MDF, flush with carcasses. A/C cut-out 500W x 150H centred over fridge'],
    ['Finger pull drawers, push to open doors', 'Finger pull drawers, push to open doors\n' + RAIL],
    ['Sirius SM927EL520 rangehood', 'Sirius SM927EL520 rangehood (specs TBC)'],
    ['Smeg 600 fridge', 'Smeg FAB28RDEG5 fridge (Emerald Green)'],
  ],
}
for (const [id, reps] of Object.entries(edits)) {
  const { data: a } = await sb.from('room_annotations').select('text').eq('id', id).single()
  let t = a.text
  for (const [o, n] of reps) { if (!t.includes(o)) { console.log('MISSING in', id, ':', o); continue } t = t.replace(o, n) }
  const r = await sb.from('room_annotations').update({ text: t }).eq('id', id).select('id')
  console.log(id.slice(0, 8), r.error?.message ?? 'ok')
}
