// RHK6586 Lounge WC-01 fs:top: board swap to PT Woodmatt 33mm Boston Oak via part_pos_overrides.mat (survives the optimiser's re-resolve)
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const CAB = '4b1d32e8-bb7f-4831-9652-c240f352321f'
const { data: c } = await sb.from('cabinet_instances').select('part_pos_overrides').eq('id', CAB).single()
const ppo = { ...(c.part_pos_overrides ?? {}), 'case_fs:top': { ...(c.part_pos_overrides?.['case_fs:top'] ?? {}), sh: 33, mat: 'f239ca6e-396a-4553-9a99-09dccf51d736' } }
const a = await sb.from('cabinet_instances').update({ part_pos_overrides: ppo }).eq('id', CAB).select('part_pos_overrides')
console.log(a.error?.message ?? JSON.stringify(a.data))
const { data: ops } = await sb.from('part_operations').select('id,output_to_cnc,router_tool_id,parameters').eq('source_cabinet_id', CAB).eq('source_part_key', 'case_fs:top')
console.log(JSON.stringify(ops))
