// RHK6478: 2pac fronts/panels -> "2 Pac - Colour TBC" (new row on the 2 Pac Satin 18mm range, finish TBC).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const P = 'fa0884a2-abd1-4370-adfa-a30044e88ef2', RANGE = 'bec37dbd-7fd1-44c7-acc1-38c74981e059'
const { data: tpl } = await sb.from('door_schedule_materials').select('*').eq('id', '651a3032-d6c1-455c-898e-d61beeab26f6').single()
let { data: row } = await sb.from('door_schedule_materials').select('id').eq('schedule_id', RANGE).eq('colour_name', '2 Pac - Colour TBC').maybeSingle()
if (!row) {
  const { id, created_at, updated_at, ...rest } = tpl
  const r = await sb.from('door_schedule_materials').insert({ ...rest, colour_name: '2 Pac - Colour TBC', colour_code: 'TBC', brand: null, finish: 'TBC', is_default: false, sort_order: 90 }).select('id').single()
  if (r.error) { console.log(r.error.message); process.exit(1) }
  row = r.data
}
const { error } = await sb.from('projects').update({ base_door_colour_id: row.id, wall_door_colour_id: row.id, tall_door_colour_id: row.id }).eq('id', P)
console.log('colour', row.id, error?.message ?? 'project set')
