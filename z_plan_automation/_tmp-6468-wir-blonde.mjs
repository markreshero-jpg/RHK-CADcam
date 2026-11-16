// RHK6468 WIR rev 4 (Mark 2026-11-16): doors + panels 18mm Polytec Woodmatt "Blonde Oak" (to be approved by client).
// Latest plans (Cab - A3 7.09-7.11 Rev B 15/10/26) = same WIR sheets as drawn (pixel diff: only Mark's markups).
//  - New board PT Woodmatt 18mm – Blonde Oak Woodmatt (+ 36 = 2 x 18 for the mirror frame, was 33).
//  - Door colour row in the Flat Panel 18mm Polytec schedule; room style -> Flat Panel 18mm Polytec, exposed -> Blonde Oak 18.
//  - Fronts 16 -> 18: carcasses 532 -> 530 so the door faces stay on the 550 line (blind panels / fillers unchanged).
//  - TEPF 16.5 -> 18 (bench seat 18 -> 888), seat / bench tops 18 (tops stay 400 / 1150), inset drawer fronts FACINS 18.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const strip = m => { const { id, created_at, updated_at, ...rest } = m; return rest }
const R = 'dfa682a3-020b-4704-8661-3dbbd6cdf224'
const P18 = 'd68dd576-6fc2-4433-b522-89cc3fe0ddba', BRONZED = 'b131041a-4d7d-4077-8951-345d602bb608'
const STYLE18 = '2638716d-7be9-474a-9242-b7d999a7d62e', SCHED18 = '58622a66-9ac3-4725-82a6-be0ac00799ec', WM_EB = '02006b48-a0fd-40b2-ba4d-d024139f95c8'
const tplC = chk('bz', await sb.from('materials').select('*').eq('id', BRONZED).single())
const colour = { colour_name: 'Blonde Oak Woodmatt', face_colour: '#d9c39f', edge_colour: '#d9c39f', is_default_colour: false }
let b18 = chk('b18', await sb.from('materials').select('id').eq('name', 'PT Woodmatt 18mm – Blonde Oak Woodmatt')).at(0)
if (!b18) b18 = chk('b18i', await sb.from('materials').insert({ ...strip(tplC), ...colour, name: 'PT Woodmatt 18mm – Blonde Oak Woodmatt' }).select('id').single())
let p36 = chk('p36', await sb.from('materials').select('id').eq('name', 'PT Woodmatt 36mm')).at(0)
if (!p36) p36 = chk('p36i', await sb.from('materials').insert({ ...strip(chk('p18', await sb.from('materials').select('*').eq('id', P18).single())), name: 'PT Woodmatt 36mm', dz: 36, notes: '2 x 18 PT Woodmatt laminated' }).select('id').single())
let b36 = chk('b36', await sb.from('materials').select('id').eq('name', 'PT Woodmatt 36mm – Blonde Oak Woodmatt')).at(0)
if (!b36) b36 = chk('b36i', await sb.from('materials').insert({ ...strip(tplC), ...colour, name: 'PT Woodmatt 36mm – Blonde Oak Woodmatt', dz: 36, parent_id: p36.id, is_default_colour: true }).select('id').single())
console.log('boards', b18.id, b36.id)
let dc = chk('dc', await sb.from('door_schedule_materials').select('id').eq('schedule_id', SCHED18).eq('colour_name', 'Blonde Oak Woodmatt')).at(0)
if (!dc) {
  const tpl = chk('tpl', await sb.from('door_schedule_materials').select('*').eq('id', 'f3fb481e-409d-4ede-a433-145386962217').single())
  dc = chk('dci', await sb.from('door_schedule_materials').insert({ ...strip(tpl), colour_name: 'Blonde Oak Woodmatt', colour_code: 'Blonde Oak', brand: 'Polytec', finish: 'Woodmatt',
    grain_direction: 'vertical', material_id: b18.id, edgeband_id: WM_EB, is_default: false, sort_order: (tpl.sort_order ?? 10) + 1 }).select('id').single())
}
console.log('door colour', dc.id)
chk('room', await sb.from('rooms').update({ door_style_override_id: STYLE18, base_door_style_id: STYLE18, wall_door_style_id: STYLE18, tall_door_style_id: STYLE18,
  base_door_colour_id: dc.id, wall_door_colour_id: dc.id, tall_door_colour_id: dc.id }).eq('id', R))
chk('rm', await sb.from('room_materials').update({ material_id: b18.id }).eq('room_id', R).eq('material_role', 'exposed'))
const f = chk('f', await sb.from('cabinet_instances').select('id,material_overrides').eq('room_id', R).eq('label', 'TC-17').single())
chk('frame', await sb.from('cabinet_instances').update({ material_overrides: { ...(f.material_overrides ?? {}), exposed: b36.id, interior: b36.id } }).eq('id', f.id))
for (const l of ['BC-01', 'BC-02', 'BC-03', 'BC-08']) {
  const c = chk(l, await sb.from('cabinet_instances').select('id,rule_overrides').eq('room_id', R).eq('label', l).single())
  chk(l + 'u', await sb.from('cabinet_instances').update({ rule_overrides: { ...(c.rule_overrides ?? {}) } }).eq('id', c.id))
}
fs.writeFileSync('z_plan_automation/_tmp-6468-wir-blonde-ids.json', JSON.stringify({ b18: b18.id, b36: b36.id, dc: dc.id }))
console.log('db done')
