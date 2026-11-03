// RHK9999 rev 4 post-steps: raked Wall 2, top-row finger gap 100, top with 100 waterfalls both ends, sink + tap on BC-01, CAD.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (l, r) => { if (r.error) { console.log(l, 'ERROR', r.error.message); process.exit(1) } return r.data }
const R = process.argv[2], STONE20 = 'da288276-4dfc-4410-b6f6-d53d1b38c8fd', MA100 = 'ebe7dd5c-adcf-45fb-a80a-19df32d0396b', WF = 'ec8720a4-d679-414f-8936-03679e555932'
const SINK = '42d89ce0-4507-4b2a-aa8c-c7ac11f8f8f1', TAP = 'c8170123-0e37-437c-a3d0-36e091b5c589'
const X0 = 1000, X1 = 4225   // top / waterfall outer faces along Wall 2
const wall2 = chk('w', await sb.from('walls').update({ top_profile: [{ t: 0, h: 2614 }, { t: 5225, h: 3900 }], height: 3900 }).eq('room_id', R).eq('name', 'Wall 2').select('id').single()).id
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,face_grid').eq('room_id', R))
const cab = l => cabs.find(c => c.label === l)
for (const x of cabs) {
  if (!x.face_grid?.zones) continue
  const top = Math.max(...x.face_grid.rows.map(r => r.row_index))
  for (const z of x.face_grid.zones) if (z.row_index === top) z.finger_gap = 100
  chk(x.label, await sb.from('cabinet_instances').update({ face_grid: x.face_grid }).eq('id', x.id).select('id'))
}
const pts = [{ x: X0, y: 0 }, { x: X1, y: 0 }, { x: X1, y: 670 }, { x: X0, y: 670 }]
const wf = { wall: false, profile_id: WF, waterfall_join: 'mitre' }
const edges = [{ wall: true }, wf, { wall: false, profile_id: MA100 }, wf]
chk('top', await sb.from('benchtop_instances').insert({
  room_id: R, label: 'Benchtop 1', wall_id: wall2, wall_side: 'face', height_mm: 880, benchtop_schedule_id: STONE20,
  notes: '20 stone + 100 mitred apron, 900 top, 670 deep (20 past the 650 fronts), 4346 long. 100 waterfall both ends (built up: face piece + return), 1000 off Wall 1. Undermount sink cut-out over BC-01; runs over the 600 bar fridge opening.',
  polygon: pts, edge_tags: [], join_types: [], arc_segments: [], cutout_polygons: [], joins: [],
  segments: pts.map((p0, i) => ({ type: 'line', p0, p1: pts[(i + 1) % 4], edge: edges[i] })),
}).select('id'))
const { data: [any] } = await sb.from('room_fixtures').select('*').limit(1)
const cols = Object.keys(any)
const cat = chk('cat', await sb.from('fixture_catalog').select('*').in('id', [SINK, TAP]))
const fromCat = (c, extra) => {
  const row = { room_id: R, catalog_id: c.id, wall_id: wall2, rotation: 0, cabinet_id: cab('BC-01').id }
  for (const k of cols) if (k in c && !['id', 'created_at', 'updated_at', 'room_id', 'wall_id', 'display_name'].includes(k) && !(k in row)) row[k] = c[k]
  return { ...row, ...extra }
}
const cx = 1100 + 300, sinkC = cat.find(c => c.id === SINK), tapC = cat.find(c => c.id === TAP)
const drop = Number(sinkC.height) + 20
chk('fixtures', await sb.from('room_fixtures').insert([
  fromCat(sinkC, { x: cx - sinkC.width / 2, y: 110, z: 900 - drop, bench_drop: drop, link_x: 300, link_z: 335 }),
  fromCat(tapC, { x: cx - tapC.width / 2, y: 43, z: 900, link_x: 300, link_z: 176.8 }),
]).select('id'))
chk('cad', await sb.from('room_annotations').insert([
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 6200, y: 0 }, width: 75 }, sort_order: 1,
    text: 'SPECIFICATIONS - {room}\n{job}\n\nBENCHTOP\n{benchtop}\n20 stone + 100 mitred apron, 900 high\n100 waterfall ends both ends\n\nFRONTS + PANELS\n{fronts}\nPanels: {panels}\nKick: to match fronts\n\nHANDLES\nFinger pulls\n\nCARCASS\n{carcass}\n\nSINK\nAbi Seba single bowl 550 U/M + Abi pull-out mixer\n\nHARDWARE\nHinges: {hinges}',
    style: { size: 2.5, bgPad: 2, block: 'Spec block', border: 'box', lineSpacing: 1.3, borderWeight: 0.35 } },
  { room_id: R, view: 'elevation', wall_id: wall2, wall_side: 'face', kind: 'text', sort_order: 2,
    geom: { at: { x: 2198, y: -560 }, width: 27 }, text: 'GLASS DOOR BAR FRIDGE - 600 OPENING, 800 CLEAR UNDER THE APRON', style: { size: 2.5, align: 'center' } },
]).select('id'))
console.log('ok')
