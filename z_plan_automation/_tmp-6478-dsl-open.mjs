// DS Linen TC-02: bottom out again (open underneath, Mark) - gables + back taped on their bottom (floor) edges; back runs down to the gable bottoms (BOTTOM_BACK_JOIN butts_into_back).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: c } = await sb.from('cabinet_instances').select('id,rule_overrides').eq('room_id', 'f1953ab4-a03b-4439-a777-d39476156f31').eq('label', 'TC-02').single()
const EDGING = { ...c.rule_overrides.EDGING, back: ['bottom'] }
console.log(JSON.stringify(EDGING), (await sb.from('cabinet_instances').update({
  part_hide_views: { case_bottom: ['plan', 'elevation', '3d'] }, rule_overrides: { ...c.rule_overrides, EDGING, BOTTOM_BACK_JOIN: 'butts_into_back' } }).eq('id', c.id)).error?.message ?? 'ok')
