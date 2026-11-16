// RHK6468 Kitchen (Mark 2026-11-16): 33 veneer dividers between base cabinets -> 100 deep, front kept flush
// (not seen behind the drawer / door fronts). End gables, void-corner gables, talls and the wine-fridge gable stay full depth.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '58bac32f-cdca-4a86-a1a4-c29af7ef9430'
const LABELS = ['BC-06', 'BC-08', 'BC-10', 'BC-12', 'BC-14', 'BC-20', 'BC-22', 'BC-35', 'BC-37', 'BC-42', 'BC-47', 'BC-49']
const all = (await sb.from('cabinet_instances').select('id,label,pos_x,pos_y,dx,dy,dz,rotation,notes').eq('room_id', R)).data
for (const l of LABELS) {
  const c = all.find(x => x.label === l)
  if (!c || c.dx !== 33 || c.dy !== 900) throw new Error('unexpected ' + l)
  if (c.dz === 100) { console.log(l, 'already 100'); continue }
  const off = c.dz - 100, r = ((c.rotation % 360) + 360) % 360
  const f = { 0: [0, 1], 90: [-1, 0], 180: [0, -1], 270: [1, 0] }[r]
  const patch = { pos_x: Math.round((c.pos_x + f[0] * off) * 1000) / 1000, pos_y: Math.round((c.pos_y + f[1] * off) * 1000) / 1000, dz: 100,
    notes: `33 TV divider (Veneer 33 American Oak), to the floor - 100 deep at the front only (was ${c.dz}, back not seen)` }
  const u = await sb.from('cabinet_instances').update(patch).eq('id', c.id)
  if (u.error) throw new Error(l + ': ' + u.error.message)
  console.log(l, `dz ${c.dz}->100`, [c.pos_x, c.pos_y], '->', [patch.pos_x, patch.pos_y])
}
