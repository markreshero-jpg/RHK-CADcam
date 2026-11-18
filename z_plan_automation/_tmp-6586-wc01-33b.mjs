// RHK6586 Lounge WC-01 ledge LED route run (Mark 2026-11-19), round 2. The direct case_parts dz edit was undone by a
// re-resolve, so: 33 via part_pos_overrides (optimiser size override, survives resolves), LED route on T110 8mm
// Downshear (auto_tool off), fs:top cleat rebate (regenerated on every resolve) off CNC.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const CAB = '4b1d32e8-bb7f-4831-9652-c240f352321f', T110 = '12163452-ea8f-407e-85a9-340204dc0e5f'
const { data: c } = await sb.from('cabinet_instances').select('part_pos_overrides').eq('id', CAB).single()
console.log('before', JSON.stringify(c.part_pos_overrides))
const ppo = { ...(c.part_pos_overrides ?? {}), 'case_fs:top': { ...(c.part_pos_overrides?.['case_fs:top'] ?? {}), sh: 33 } }
const a = await sb.from('cabinet_instances').update({ part_pos_overrides: ppo }).eq('id', CAB).select('part_pos_overrides')
console.log('ppo', a.error?.message ?? JSON.stringify(a.data))
const b = await sb.from('part_operations').update({ router_tool_id: T110, auto_tool: false }).eq('id', '88305f1a-83ba-429a-b77c-a7a20f51f834').select('id,router_tool_id,auto_tool')
console.log('led', b.error?.message ?? JSON.stringify(b.data))
const d = await sb.from('part_operations').update({ output_to_cnc: false }).eq('source_cabinet_id', CAB).eq('source_part_key', 'case_fs:top').contains('parameters', { kind: 'float_shelf_pocket' }).select('id,output_to_cnc')
console.log('rebate', d.error?.message ?? JSON.stringify(d.data))
