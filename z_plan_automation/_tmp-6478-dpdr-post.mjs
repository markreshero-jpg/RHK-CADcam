// RHK6478 DS Powder: fix rounded dx/offsets, copy the US Powder room finishes, 70 scribe strips on TC-01/TC-04,
// 2351 x 500 60 stone top wall to wall at 820, 140 basin centred 600 from the left wall (finishes 960), re-resolve.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const SRC = '14b571e0-ba97-410c-988a-6950e6da5780', R = 'e2a2d342-8475-4967-b1be-8387919acd1c'
const LEN = 2351, D = 500, BX = 600, TOP = 820
// 1. exact sizes (placeCabinet rounds)
const want = { 'TC-01': [0, 16.5], 'TC-02': [16.5, 16.5], 'BC-01': [33, 571], 'BC-02': [604, 571.5], 'BC-03': [1175.5, 571.5], 'BC-04': [1747, 571], 'TC-03': [2318, 16.5], 'TC-04': [2334.5, 16.5] }
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label').eq('room_id', R))
const id = Object.fromEntries(cabs.map(c => [c.label, c.id]))
for (const [l, [off, dx]] of Object.entries(want)) chk(l, await sb.from('cabinet_instances').update({ pos_x: off, dx }).eq('id', id[l]))
// 2. panels: strips + comments (as the US Powder)
const mate = { 'TC-01': 'TC-02', 'TC-02': 'TC-01', 'TC-03': 'TC-04', 'TC-04': 'TC-03' }
for (const l of ['TC-01', 'TC-02', 'TC-03', 'TC-04']) {
  const cp = chk('cp', await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', id[l]))[0]
  const isStrip = l === 'TC-01' || l === 'TC-04', side = l < 'TC-03' ? 'Left' : 'Right'
  if (isStrip) chk('strip', await sb.from('cabinet_custom_parts').update({ dx: 70, z: 425, expressions: { dx: '70', dy: 'cab.h', dz: 't.exposed', z: 'cab.d + t.door + 2 - 70' } }).eq('id', cp.id))
  const comment = isStrip ? `70 SCRIBE STRIP - glue face to face onto the front 70 of ${mate[l]}, scribe to wall` : `Full-depth end panel - ${mate[l]} 70 scribe strip glued to its wall-side face at the front`
  const notes = isStrip ? `${side} wall-side 70 scribe strip (16.5), glued to ${mate[l]} front` : `33 end panel ${side[0]}, cabinet half`
  chk('pc', await sb.from('cabinet_instances').update({ notes, part_comments: { [`custom_${cp.id}`]: comment } }).eq('id', id[l]))
}
// 3. room finishes
const src = chk('src', await sb.from('rooms').select('base_door_style_id,base_door_colour_id,tall_door_style_id,tall_door_colour_id,wall_door_style_id,wall_door_colour_id,handle_schedule_id').eq('id', SRC).single())
chk('room', await sb.from('rooms').update(src).eq('id', R))
const rm = chk('rm', await sb.from('room_materials').select('assembly_class,material_role,material_id').eq('room_id', SRC))
chk('rm del', await sb.from('room_materials').delete().eq('room_id', R))
if (rm.length) chk('rm ins', await sb.from('room_materials').insert(rm.map(x => ({ ...x, room_id: R }))))
// 4. top
const wall = chk('wall', await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).id
const stop = chk('stop', await sb.from('benchtop_instances').select('benchtop_schedule_id').eq('room_id', SRC).single())
const MA60 = '59a7169d-761a-414d-82b0-bd8ea7123853', A = { wall: false, profile_id: MA60 }
const pts = [{ x: 0, y: 0 }, { x: LEN, y: 0 }, { x: LEN, y: D }, { x: 0, y: D }]
const edges = [{ wall: true }, { wall: true }, A, { wall: true }]
chk('top del', await sb.from('benchtop_instances').delete().eq('room_id', R))
chk('top', await sb.from('benchtop_instances').insert({ room_id: R, label: 'Benchtop 1', wall_id: wall, wall_side: 'face', height_mm: TOP - 20, benchtop_schedule_id: stop.benchtop_schedule_id,
  notes: 'Vanity 60 finished: 20mm YDL Bella Oro + 60 mitred apron on the front, 2351 x 500 wall to wall, top 820 AFF (140 basin finishes 960). Basin + spout 600 from the left wall.',
  polygon: pts, edge_tags: [], join_types: [], arc_segments: [], cutout_polygons: [], joins: [],
  segments: pts.map((p0, i) => ({ type: 'line', p0, p1: pts[(i + 1) % 4], edge: edges[i] })) }))
// 5. basin (US Powder row, 140 high)
const bas = chk('bas', await sb.from('room_fixtures').select('*').eq('room_id', SRC).eq('category', 'sink'))[0]
chk('fx del', await sb.from('room_fixtures').delete().eq('room_id', R).eq('category', 'sink'))
const { id: _i, created_at, updated_at, room_id, wall_id, cabinet_id, link_x, link_z, lock_group, ...rest } = bas
const fx = chk('fx', await sb.from('room_fixtures').insert({ ...rest, room_id: R, wall_id: wall, name: 'Basin 360 round x 140 (model TBC)', model_no: null, height: 140,
  x: BX - Number(bas.width) / 2, y: 250 - Number(bas.depth) / 2, z: TOP }).select('id,x,y'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(2500)
  for (const f of fx) { await page.evaluate(([id, x, y]) => window.__canvasApi.updateFixture(id, { x, y }), [f.id, Number(f.x), Number(f.y)]); await sleep(900) }
  let st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [c.label, c.dz]); await sleep(1200) }
  st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) console.log(c.label, c.offset, c.dx, c.dy, c.dz)
  for (const f of st.fixtures ?? []) console.log('fixture', f.name, JSON.stringify({ x: f.x, y: f.y, z: f.z, cab: f.cabinet, clash: f.clash }))
  for (const l of ['BC-01', 'BC-02', 'TC-01']) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, JSON.stringify([...rp.case_parts.map(p => [p.part_key, p.Y, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)]), ...rp.custom_parts.map(p => [p.name, p.dx, p.dy, p.dz, p.z, p.material_id?.slice(0, 8)])]))
    if (rp.face_zones.length) console.log(l, 'zones', JSON.stringify(rp.face_zones.map(z => [z.Y, z.DY, z.material_id?.slice(0, 8), z.handle?.grip_kind])))
    for (const s of rp.drawer_stacks ?? []) console.log(l, 'box', JSON.stringify({ Y: s.box_Y, h: s.slides?.[0]?.box_height }))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
