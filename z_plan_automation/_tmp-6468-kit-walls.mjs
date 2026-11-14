// RHK6468 Kitchen: walls into the existing (empty) Kitchen room, same rows draw-plan.mjs makes.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ROOM = '58bac32f-cdca-4a86-a1a4-c29af7ef9430'
const L = JSON.parse(fs.readFileSync('z_plan_automation/layouts/rhk6468-mossman-kitchen.json', 'utf8'))
const { data: ex } = await sb.from('walls').select('id').eq('room_id', ROOM)
if (ex.length) { console.log('walls exist:', ex.length); process.exit(0) }
for (const [i, w] of L.walls.entries()) {
  const { data, error } = await sb.from('walls').insert({
    room_id: ROOM, name: `Wall ${i + 1}`, sort_order: i, length: w.length, angle: w.angle, pos_x: w.x, pos_y: w.y,
    thickness: w.thickness ?? (w.type === 'island' ? 0 : 90), height: w.height ?? L.roomHeight ?? 2400,
    soffit_height: w.soffit ?? null, wall_type: w.type === 'island' ? 'island' : 'standard',
  }).select('id,name').single()
  if (error) throw error
  console.log(data.name, w._)
}
