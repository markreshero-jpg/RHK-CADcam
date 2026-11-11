// RHK6478 Buffet rev 3 (Darby 2026-11-11 + Mark): 18 2pac gable LH of the bar fridges at Wall 1 (BC-07, copy of BC-01 incl apron notch),
// fridges / panels / cleats +18, drawers 1039 -> 1021 + kick; uppers match: WC-02 open unit 1246 -> 1264, WC-03 at 1294 x 1021;
// everything above the bench Sublime Teak: WC-03 fronts Lx 16mm Colour Teak, WC-04 filler + WC-05 shadowline Teak 16.5. No deletes.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) { console.log('ERR', t, r.error.message); process.exit(1) } return r.data }
const R = '0df13af4-8a6f-438f-a10d-6a9b4754aa97'
const LX16 = '8ffd3162-6b06-4abf-9f00-e05caf04eb79', TEAK = '5fdb0fa7-e212-49aa-b8e6-044210033c85', TEAK_BOARD = '67ecbeff-98ac-41e1-9b1a-618a5bf6a96b'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('*').eq('room_id', R))
const by = l => cabs.find(c => c.label === l)
if (by('BC-07')) { console.log('BC-07 exists - already run'); process.exit(0) }
const upd = async (l, v) => { chk(l, await sb.from('cabinet_instances').update(v).eq('id', by(l).id)); console.log(l, JSON.stringify(v).slice(0, 120)) }

// 1. new gable BC-07 = copy of BC-01 at Wall 1
const src = by('BC-01')
const { id, created_at, updated_at, ...rest } = src
const nb = chk('ins', await sb.from('cabinet_instances').insert({ ...rest, label: 'BC-07', pos_x: 0, notes: '18 2pac gable LH of bar fridge 1 to Wall 1 (Darby 2026-11-11), to the floor, notched 22 x 40 at the top front for the bench apron' }).select('id').single())
const cps = chk('cp', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', src.id))
for (const cp of cps) {
  const { id: cid, created_at, updated_at, ...c } = cp
  const ncp = chk('cp ins', await sb.from('cabinet_custom_parts').insert({ ...c, cabinet_instance_id: nb.id }).select('id').single())
  const so = chk('so', await sb.from('part_shape_overrides').select('*').eq('cabinet_id', src.id).eq('part_key', 'custom_' + cid).order('revision', { ascending: false }).limit(1))
  if (so.length) { const { id: sid, created_at, updated_at, ...s } = so[0]; chk('so ins', await sb.from('part_shape_overrides').insert({ ...s, cabinet_id: nb.id, part_key: 'custom_' + ncp.id, revision: 1 })) }
}
console.log('BC-07 added', nb.id)

// 2. shift +18
for (const l of ['BC-01', 'BC-02', 'BC-05', 'BC-06']) await upd(l, { pos_x: by(l).pos_x + 18 })
await upd('BC-03', { pos_x: 1294, dx: 1021 })
await upd('KICK 1', { pos_x: 1294, dx: by('KICK 1').dx - 18 })

// 3. uppers match + Teak
await upd('WC-02', { dx: 1264 })
const fg = structuredClone(by('WC-03').face_grid)
fg.zones = fg.zones.map(z => ({ ...z, door_style_id: LX16, door_colour_id: TEAK }))
await upd('WC-03', { pos_x: 1294, dx: 1021, face_grid: fg, notes: 'Upper pair, Lx Sublime Teak Chalk 16.5 (Darby 2026-11-11: everything above the bench Teak), sharknose, 2 adj shelves' })
await upd('WC-04', { material_overrides: { ...(by('WC-04').material_overrides ?? {}), exposed: TEAK_BOARD }, notes: '30 upper filler to Wall 3, Sublime Teak 16.5' })
chk('WC-04 cp', await sb.from('cabinet_custom_parts').update({ material_id: TEAK_BOARD, dz: 16.5 }).eq('cabinet_instance_id', by('WC-04').id))
await upd('WC-05', { material_overrides: { ...(by('WC-05').material_overrides ?? {}), exposed: TEAK_BOARD }, dy: 16.5, notes: '16.5 Sublime Teak shadowline, wall to wall (Darby 2026-11-11)' })

// 4. annotations
const anns = chk('ann', await sb.from('room_annotations').select('*').eq('room_id', R))
for (const a of anns) {
  let v = null
  if (a.view === 'elevation' && a.kind === 'text' && /^BAR FRIDGE|^VENT SLOTS/.test(a.text ?? '')) v = { geom: { ...a.geom, at: { ...a.geom.at, x: a.geom.at.x + 18 } } }
  else if (a.kind === 'text' && /MIRROR 1180/.test(a.text ?? '')) v = { text: a.text.replace('MIRROR 1180', 'MIRROR 1198') }
  else if (a.kind === 'text' && /^SPECIFICATIONS/.test(a.text ?? '')) v = { text: a.text.replace('FRONTS + PANELS\n2 Pac - colour TBC', 'ABOVE BENCH (uppers, fillers, shadowline)\nLx Sublime Teak (Chalk) 16.5\n\nBELOW BENCH (fronts + panels)\n2 Pac - Dulux White Beach Quarter (25W)') }
  if (v) { chk('ann', await sb.from('room_annotations').update(v).eq('id', a.id)); console.log('ann', (a.text ?? '').slice(0, 30).replace(/\n/g, ' '), JSON.stringify(v).slice(0, 80)) }
}
process.exit(0)
