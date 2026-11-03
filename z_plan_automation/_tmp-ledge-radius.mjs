// Temp: RHK6586 TV ledge R300 via float_shelf.radius_r (replaces the fs:top / fs:bot shape overrides).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) throw error }
const { data: [c] } = await sb.from('cabinet_instances').select('id,float_shelf').eq('room_id', 'ddc7d7e2-abd3-4f13-8b65-72eac0050bb6').eq('label', 'WC-01')
let r = await sb.from('cabinet_instances').update({ float_shelf: { ...c.float_shelf, radius_r: 300 } }).eq('id', c.id)
console.log(r.error ? 'ERR ' + r.error.message : 'ok radius_r 300')
r = await sb.from('part_shape_overrides').delete().eq('cabinet_id', c.id).in('part_key', ['fs:top', 'fs:bot']).select('id')
console.log(r.error ? 'ERR ' + r.error.message : 'deleted overrides ' + r.data.length)
