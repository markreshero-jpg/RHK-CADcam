// RHK6478 Laundry: Darby 2026-11-11 - remove the central divider in the RH linen tall (TC-08); one full-width section, 4 adj shelves.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const id = 'dcf95031-a5ee-43ce-8b21-9fd4a8015598'
const shelves = Array.from({ length: 4 }, () => ({ type: 'adj_shelf', y_locked: false }))
const { error } = await sb.from('cabinet_instances').update({ internal_grid: { tree: { type: 'open', fittings: shelves } }, notes: 'Linen - lower pair to 2020, no divider (Darby 2026-11-11), all shelves adjustable' }).eq('id', id)
console.log(error?.message ?? 'TC-08 divider removed')
process.exit(0)
