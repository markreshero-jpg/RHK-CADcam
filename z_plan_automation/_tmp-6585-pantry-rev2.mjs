// RHK6585 Pantry rev 2 (Mark 2026-11-24): return wall off Wall 1 out to Wall 5's line (room squared off) - Wall 6.
//   node _tmp-6585-pantry-rev2.mjs wall | show
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '7b416272-2861-4bf8-a60f-94f5632aa439'
if (process.argv[2] === 'wall') {
  const ws = chk('w', await sb.from('walls').select('name,sort_order').eq('room_id', R))
  if (ws.some(w => w.name === 'Wall 6')) console.log('Wall 6 already there')
  // Clockwise: from Wall 5's line (x 2056) west to the open end of Wall 1 (0,1664), where Wall 1 starts.
  else console.log(chk('ins', await sb.from('walls').insert({ room_id: R, name: 'Wall 6', sort_order: 5, length: 2056, angle: 180, pos_x: 2056, pos_y: 1664,
    thickness: 90, height: 2583, wall_type: 'standard' }).select('name,length,pos_x,pos_y,angle').single()))
}
for (const r of chk('c', await sb.from('cabinet_instances').select('label,pos_x,pos_y,pos_z,dx,dy,dz,has_toekick,kick_run_id,rotation,float_shelf').eq('room_id', R).in('label', ['BC-01', 'BC-02', 'BC-04', 'KICK 1', 'WC-05'])))
  console.log(r.label, r.pos_x, r.pos_y, r.pos_z, r.dx, r.dy, r.dz, 'toe', r.has_toekick, 'run', r.kick_run_id, 'rot', r.rotation, r.float_shelf ? JSON.stringify(r.float_shelf) : '')
process.exit(0)
