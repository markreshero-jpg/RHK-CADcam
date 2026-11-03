// RHK6586 kitchenette (Mark 2026-10-31): WC-08 ends flush with the carcase (WC-02 right gable, 1918.5), not the WC-03 end panel.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) throw error }
const { data, error } = await sb.from('cabinet_instances').update({ dx: 1918.5 - 268.5 }).eq('room_id', 'a496c328-cfda-4f74-8c6d-175edd8e5907').eq('label', 'WC-08').select('label,pos_x,dx')
console.log(error?.message ?? JSON.stringify(data))
