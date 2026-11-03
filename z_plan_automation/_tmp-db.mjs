// Temp: delete rows by room + labels / ids.  node _tmp-db.mjs <table> <roomId> <col> <v1,v2,...>
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) { console.log('sign-in failed', error.message); process.exit(1) } }
const [table, roomId, col, vals] = process.argv.slice(2)
const { data, error } = await sb.from(table).delete().eq('room_id', roomId).in(col, vals.split(',')).select(col)
console.log(error ? 'ERROR ' + error.message : 'deleted ' + JSON.stringify(data))
