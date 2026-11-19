// RHK6586 2026-11-20 read-only: kitchenette walls + cabinets near the pantry (618 markup)
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ROOM='a496c328-cfda-4f74-8c6d-175edd8e5907'
const w=(await sb.from('walls').select('*').eq('room_id',ROOM)).data
for(const x of w) console.log('WALL',JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k,v])=>v!=null&&!/created|updated|room_id/.test(k)))))
const c=(await sb.from('cabinet_instances').select('*').eq('room_id',ROOM)).data
for(const x of c) if(/^(TC|WC-12|WC-07)/.test(x.label)) console.log(x.label,x.id,JSON.stringify({wall:x.wall_id,code:x.code,px:x.pos_x,py:x.pos_y,pz:x.pos_z,dx:x.dx,dy:x.dy,dz:x.dz,rot:x.rotation,fp:x.footprint?JSON.stringify(x.footprint).slice(0,900):null,notes:x.notes}))
