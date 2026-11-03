// Temp: generic select.  node _tmp-6586-q.mjs <table> <col> <val> [select]
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const [table, col, val, sel] = process.argv.slice(2)
let q = sb.from(table).select(sel ?? '*')
if (col && col !== '-') q = val.includes(',') ? q.in(col, val.split(',')) : q.eq(col, val)
const { data, error } = await q
console.log(error ? 'ERROR ' + error.message : JSON.stringify(data, null, 1))
