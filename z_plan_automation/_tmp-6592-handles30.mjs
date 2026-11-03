// RHK6592 (Mark 2026-11-01): shaker fronts — handles centred on the 60 rail/stile: nearest hole 30 from the grip
// edge, doors 30 in from the opening edge, drawers centred. Cabinet hardware_overrides (D18), kitchen + butlers.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const steps = {}
for (const room of ['dc7a22f3-ed0b-4771-a42e-4548fc4de1e1', '1c00eb19-09c1-41b8-8c7c-a6441ee0263d']) {
  const cabs = (await sb.from('cabinet_instances').select('id,label,dz,has_face,hardware_overrides,face_grid').eq('room_id', room).order('label')).data
  steps[room] = []
  for (const c of cabs) {
    if (!c.has_face || !(c.face_grid?.zones ?? []).some(z => z.face_type === 'door' || z.face_type === 'drawer_face')) continue
    const zo = (c.face_grid?.zones ?? []).filter(z => z.handle_offset != null || z.handle_inset != null)
    if (zo.length) console.log('ZONE OVERRIDE', c.label, JSON.stringify(zo.map(z => [z.handle_offset, z.handle_inset])))
    if (process.argv[2] !== 'go') { console.log(c.label, JSON.stringify(c.hardware_overrides)); continue }
    const r = await sb.from('cabinet_instances').update({ hardware_overrides: { ...(c.hardware_overrides ?? {}), handle_offset: 30, handle_inset: 30 } }).eq('id', c.id)
    if (r.error) { console.error(c.label, r.error.message); process.exit(1) }
    steps[room].push(['updateCabinet', [c.label, { dz: Number(c.dz) }]])
  }
  fs.writeFileSync(`z_plan_automation/_tmp-6592-h-${room.slice(0, 4)}.json`, JSON.stringify(steps[room]))
}
