import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb'
const r = await sb.from('room_annotations').update({ geom: { at: { x: 1250, y: 1400 }, width: 75 } }).eq('room_id', R).eq('text', 'PENDANT LIGHTS OVER ISLAND - OWNER SUPPLIED').select('id')
console.log(r.error?.message ?? r.data.length)
