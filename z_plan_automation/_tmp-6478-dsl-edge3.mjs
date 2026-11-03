// DS Linen TC-02: EDGING override = the construction schedule row's EDGING + gable bottoms taped.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: p } = await sb.from('projects').select('construction_schedule_id').eq('id', 'fa0884a2-abd1-4370-adfa-a30044e88ef2').single()
const { data: s } = await sb.from('shop_settings').select('construction_schedule_id').limit(1).maybeSingle()
const sid = p.construction_schedule_id ?? s.construction_schedule_id
const { data: rows } = await sb.from('construction_method_schedule_rows').select('*').eq('schedule_id', sid)
const row = rows.find(r => r.assembly_class === 'tall') ?? rows[0]
console.log('sched', sid, 'classes', rows.map(r => r.assembly_class).join(','))
const base = row.rules?.EDGING ?? {}
console.log('row EDGING', JSON.stringify(base))
const side = s => [...new Set([...(base[s] ?? ['top', 'bottom', 'left', 'right']), 'bottom'])]
const EDGING = { ...base, left_side: side('left_side'), right_side: side('right_side') }
const { data: c } = await sb.from('cabinet_instances').select('id,rule_overrides').eq('room_id', 'f1953ab4-a03b-4439-a777-d39476156f31').eq('label', 'TC-02').single()
const { error } = await sb.from('cabinet_instances').update({ rule_overrides: { ...(c.rule_overrides ?? {}), EDGING } }).eq('id', c.id)
console.log('set', JSON.stringify(EDGING), error?.message ?? 'ok')
