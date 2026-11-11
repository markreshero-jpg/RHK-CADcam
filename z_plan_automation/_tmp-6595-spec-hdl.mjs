// RHK6595 (Mark 2026-11-11): spec block handles line -> supplied by others (edited in place).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ID = '8391e25d-eddc-4f98-8dd8-790f5da43bd9'
const { data: [a] } = await sb.from('room_annotations').select('text').eq('id', ID)
const old = 'Handle House C138 Maleny satin nickel, size TBC - supplied + drilled on site by the builder'
if (!a.text.includes(old)) throw new Error('handles line not found: ' + a.text)
const r = await sb.from('room_annotations').update({ text: a.text.replace(old, 'Handle House C138 Maleny satin nickel, size TBC - supplied + fitted by others') }).eq('id', ID)
console.log(r.error?.message ?? 'ok')
console.log((await sb.from('room_annotations').select('text').eq('id', ID)).data[0].text)
