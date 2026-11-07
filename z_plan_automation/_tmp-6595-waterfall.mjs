// RHK6595 island top (Benchtop 1): east end -> 20 stone waterfall per the plan (page 4: 1996 run + 20 waterfall = 2016).
// Only the east edge moves (2986 -> 3006) and gets the WF profile, mitred. Nothing else on the top is touched.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ID = '47761820-0942-4a85-a0bf-71835a9f0353', WF = 'ec8720a4-d679-414f-8936-03679e555932'
const { data: t } = await sb.from('benchtop_instances').select('polygon,segments').eq('id', ID).single()
fs.writeFileSync('z_plan_automation/_tmp-6595-bt1-before.json', JSON.stringify(t))
const mv = p => (Math.abs(p.x - 2986) < 0.01 ? { ...p, x: 3006 } : p)
const segs = t.segments.map((s, i) => ({ ...s, p0: mv(s.p0), p1: mv(s.p1), ...(i === 1 ? { edge: { wall: false, profile_id: WF, waterfall_join: 'mitre' } } : {}) }))
const polygon = Array.isArray(t.polygon) ? t.polygon.map(mv) : t.polygon
const r = await sb.from('benchtop_instances').update({ segments: segs, polygon }).eq('id', ID).select('segments')
console.log(r.error?.message ?? JSON.stringify(r.data[0].segments.map(s => [s.p0.x, s.p0.y, s.p1.x, s.p1.y, s.edge?.profile_id ? 'WF' : ''])))
