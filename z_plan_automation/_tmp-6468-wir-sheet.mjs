// RHK6468 WIR (Mark 2026-11-17): Blonde Oak Woodmatt comes in 3100 sheets -> 3100 long (width kept at 1211; 'sheet_dx' in overridden so the colour rows don't inherit the parent's 2415).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const r = await sb.from('materials').update({ sheet_dx: 3100, overridden: ['sheet_dx'] }).in('id', ['b7b521b4-9d7b-4631-995c-417ae940b86e', 'd082468d-f494-4116-8cf6-e5ea7bafe734']).select('name,sheet_dx,sheet_dy')
console.log(r.error ?? r.data)
