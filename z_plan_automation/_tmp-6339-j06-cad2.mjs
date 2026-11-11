// RHK6339 J07: nudge two of my own notes off the size labels (update in place).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const up = async (id, at) => { const { data } = await sb.from('room_annotations').select('geom').eq('id', id).single(); console.log((await sb.from('room_annotations').update({ geom: { ...data.geom, at } }).eq('id', id)).error?.message ?? 'ok') }
await up('4da03462-c87e-48c7-817a-ab36624aa041', { x: 180, y: -330 })
await up('49060384-42c5-4038-95b3-3e911f6468b4', { x: 2150, y: -980 })
