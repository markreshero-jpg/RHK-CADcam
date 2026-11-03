// RHK6478 Buffet: new board colour "LX Board 33mm – Sublime Teak" on the LX Board 33mm range (copy of the Tasmanian Oak child,
// look from LX Colour 16mm – Sublime Teak). All timbergrain in the job = Sublime Teak (Mark 2026-11-02).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const NAME = 'LX Board 33mm – Sublime Teak'
const { data: have } = await sb.from('materials').select('id').eq('name', NAME).maybeSingle()
if (have) { console.log('exists', have.id); process.exit(0) }
const { data: tas } = await sb.from('materials').select('*').eq('id', 'a92331d4-f2fd-4a82-9984-86f5af59bb01').single()
const { data: teak } = await sb.from('materials').select('*').eq('id', '67ecbeff-98ac-41e1-9b1a-618a5bf6a96b').single()
const { id, created_at, updated_at, ...row } = tas
const look = Object.fromEntries(Object.entries(teak).filter(([k]) => /colour$|^texture/.test(k) && k !== 'colour_code'))
const { data, error } = await sb.from('materials').insert({ ...row, ...look, name: NAME, colour_name: 'Sublime Teak', notes: 'Laminex 33mm board, Sublime Teak (RHK6478 Buffet open shelf unit).' }).select('id,name,dz,parent_id')
console.log(error?.message ?? JSON.stringify(data), Object.keys(look))
const { data: wb } = await sb.from('materials').select('id,name,dz').ilike('name', '%whiteboard%').order('name')
console.log(JSON.stringify(wb))
