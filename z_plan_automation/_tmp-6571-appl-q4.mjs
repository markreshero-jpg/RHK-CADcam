import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3'
const an = await sb.from('room_annotations').select('*').eq('room_id', R).order('sort_order')
console.log(an.error?.message, Object.keys(an.data[0]))
for (const a of an.data) console.log(a.id.slice(0, 8), a.view, a.kind, a.wall_id?.slice(0,4), a.created_at?.slice(0, 16), a.updated_at?.slice(0, 16), a.style?.src ?? 'USER', JSON.stringify(a.text ?? '').slice(0, 40), a.kind === 'cloud' ? JSON.stringify(a.geom.pts.map(p=>[p.x,p.y])) : '')
