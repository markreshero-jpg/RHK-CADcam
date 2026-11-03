// RHK6592 rev 1 (Mark 2026-10-29): island back panel to the floor, 2pac kick face, sinks 600 "Undermount sink"
// on their cupboards (room coords), spec blocks on both rooms.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) { console.error(what, r.error.message); process.exit(1) } console.log('ok', what, JSON.stringify(r.data)); return r.data }
const PROJ = 'f801076c-4e6b-4214-b0b6-91e92c2dfa8c', KIT = 'dc7a22f3-ed0b-4771-a42e-4548fc4de1e1', BUT = '1c00eb19-09c1-41b8-8c7c-a6441ee0263d'

// 1. Island back panel to the floor
const ibpf = (await sb.from('cabinet_definitions').select('id,back_panel').eq('name', 'IBPF')).data[0]
chk('IBPF', await sb.from('cabinet_instances').update({ cabinet_definition_id: ibpf.id, back_panel: { ...(ibpf.back_panel ?? {}), mount: 'floor', sheet_w: 1200 } }).eq('room_id', KIT).eq('label', 'BC-01').select('label,back_panel'))

// 2. Kick face = the fronts' board (Satin Board 18 – White)
chk('kick face', await sb.from('job_toekick_materials').update({ material_id: 'b07a7e40-facd-4cdf-8856-60712e940b44' }).eq('project_id', PROJ).eq('part_role', 'face').select('material_id'))

// 3. Sinks 600 wide, rim at the carcass top (880 = 20 under the top). x/y = room coords of the
//    fixture's back-left corner in its own frame (local x along the run, local y out from the back).
const sink = { width: 600, cutout_w: 570, name: 'Undermount sink', display_name: 'Undermount sink', label: 'Undermount sink', brand: null, z: 675, bench_drop: 225 }
const fx = async (room) => (await sb.from('room_fixtures').select('id,kind').eq('room_id', room)).data
for (const f of await fx(KIT)) {
  if (f.kind === 'Kitchen sink') chk('kit sink', await sb.from('room_fixtures').update({ ...sink, rotation: 90, x: 2285 - 80, y: 3479 - 300 }).eq('id', f.id).select('x,y'))
  if (f.kind === 'Tap') chk('kit tap', await sb.from('room_fixtures').update({ rotation: 90, x: 2285 - 15, y: 3479 - 58.5 }).eq('id', f.id).select('x,y'))
}
for (const f of await fx(BUT)) {
  if (f.kind === 'Kitchen sink') chk('but sink', await sb.from('room_fixtures').update({ ...sink, rotation: 270, x: 80, y: 1235 + 300 }).eq('id', f.id).select('x,y'))
  if (f.kind === 'Tap') chk('but tap', await sb.from('room_fixtures').update({ rotation: 270, x: 15, y: 1235 + 58.5 }).eq('id', f.id).select('x,y'))
}

// 4. Spec blocks
const style = { size: 2.5, bgPad: 2, block: 'Spec block', border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const KIT_TEXT = `SPECIFICATIONS - {room}
{job}

BENCHTOP
YDL Stone Nuvola Snow: 20mm on the carcass + 60mm apron, 900 top
60mm waterfalls: island north end + wall run north end

FRONTS + PANELS
{fronts}
2pac Classic White Satin on 18mm satin board, flat
End panels 18mm 2pac. Kick 110: 2pac to match fronts
Island back panel to the floor

HANDLES
{handles}

SINK
{sinks}
{taps}

CARCASS
{carcass}

DRAWERS
Drawer box: {drawer_box}

HARDWARE
Hinges: {hinges}
Runners: {runners}

APPLIANCES
Under-bench oven 600, cooktop over. Rangehood TBC
Pull-out bin: {bins}
Fridge space 920 x 1850 high`
const BUT_TEXT = `SPECIFICATIONS - {room}
{job}

BENCHTOP
YDL Stone Nuvola Snow 20mm

FRONTS + PANELS
{fronts}
2pac Classic White Satin on 18mm satin board, flat
End panels 18mm 2pac. Kick 110: 2pac to match fronts
Open shelving + its panels: PT 16mm Classic White Matt,
6 adj shelves each

HANDLES
{handles}

SINK
{sinks}
{taps}

CARCASS
{carcass}

HARDWARE
Hinges: {hinges}

APPLIANCES
Freestanding D/W, washer + dryer (610 spaces), by others`
for (const [room, text, x] of [[KIT, KIT_TEXT, 4300], [BUT, BUT_TEXT, 4300]]) {
  await sb.from('room_annotations').delete().eq('room_id', room).eq('view', 'plan').contains('style', { block: 'Spec block' })
  chk('spec', await sb.from('room_annotations').insert({ room_id: room, view: 'plan', kind: 'text', geom: { at: { x, y: 0 }, width: 75 }, text, style, sort_order: 30 }).select('id'))
}
