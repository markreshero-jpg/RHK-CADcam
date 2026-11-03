// RHK6478 Guest Ensuite: copy the US Main Ensuite's room finishes, 1000 x 500 60 stone top (apron front + seen right end), 1 basin on the tap, re-resolve.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const SRC = '6e8f14c4-1325-4f07-b312-a6f9386d0245', R = '9c8f3cbf-5d9d-43b9-9f81-c409417dc84b'
const X0 = 0, LEN = 1000, D = 500
// 1. room finishes
const src = chk('src', await sb.from('rooms').select('base_door_style_id,base_door_colour_id,tall_door_style_id,tall_door_colour_id,wall_door_style_id,wall_door_colour_id,handle_schedule_id').eq('id', SRC).single())
chk('room', await sb.from('rooms').update(src).eq('id', R))
const rm = chk('rm', await sb.from('room_materials').select('assembly_class,material_role,material_id').eq('room_id', SRC))
chk('rm del', await sb.from('room_materials').delete().eq('room_id', R))
if (rm.length) chk('rm ins', await sb.from('room_materials').insert(rm.map(x => ({ ...x, room_id: R }))))
// 2. top
const wall = chk('wall', await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).id
const stop = chk('stop', await sb.from('benchtop_instances').select('benchtop_schedule_id').eq('room_id', SRC).single())
const MA60 = '59a7169d-761a-414d-82b0-bd8ea7123853', A = { wall: false, profile_id: MA60 }
const pts = [{ x: X0, y: 0 }, { x: X0 + LEN, y: 0 }, { x: X0 + LEN, y: D }, { x: X0, y: D }]
const edges = [{ wall: true }, A, A, { wall: true }]
chk('top del', await sb.from('benchtop_instances').delete().eq('room_id', R))
chk('top', await sb.from('benchtop_instances').insert({ room_id: R, label: 'Benchtop 1', wall_id: wall, wall_side: 'face', height_mm: 800, benchtop_schedule_id: stop.benchtop_schedule_id,
  notes: 'Vanity 60 finished: 20mm YDL Bella Oro + 60 mitred apron on the front and the seen right end, 1000 x 500 from the left wall, top 820 AFF, 5 past the end panel. 1 x Harmony Bassini 360 round x 115 centred on the tap (510).',
  polygon: pts, edge_tags: [], join_types: [], arc_segments: [], cutout_polygons: [], joins: [],
  segments: pts.map((p0, i) => ({ type: 'line', p0, p1: pts[(i + 1) % 4], edge: edges[i] })) }))
// 3. basins (copied from the ensuite rows), centred on each bay
const bas = chk('bas', await sb.from('room_fixtures').select('*').eq('room_id', SRC).eq('category', 'sink'))
chk('fx del', await sb.from('room_fixtures').delete().eq('room_id', R).eq('category', 'sink'))
const centres = [510]
const fx = chk('fx', await sb.from('room_fixtures').insert(centres.map(cx => {
  const { id, created_at, updated_at, room_id, wall_id, cabinet_id, link_x, link_z, lock_group, ...rest } = bas[0]
  return { ...rest, room_id: R, wall_id: wall, x: cx - 180, y: 250 - 180, z: 820 }
})).select('id,x,y'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  for (const f of fx) { await page.evaluate(([id, x, y]) => window.__canvasApi.updateFixture(id, { x, y }), [f.id, Number(f.x), Number(f.y)]); await sleep(900) }
  let st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [c.label, c.dz]); await sleep(1200) }
  st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) console.log(c.label, c.offset, c.dx, c.dy, c.dz)
  for (const f of st.fixtures ?? []) console.log('fixture', f.name, JSON.stringify({ x: f.x, y: f.y, cab: f.cabinet, clash: f.clash }))
  for (const l of ['BC-01', 'TC-01', 'TC-02', 'WC-01']) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, JSON.stringify([...rp.case_parts.map(p => [p.part_key, p.Y, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)]), ...rp.custom_parts.map(p => [p.name, p.dx, p.dy, p.dz, p.material_id?.slice(0, 8)])]))
    if (rp.face_zones.length) console.log(l, 'zones', JSON.stringify(rp.face_zones.map(z => [z.Y, z.DY, z.material_id?.slice(0, 8), z.handle?.grip_kind])))
    if (rp.internal_slides?.length) console.log(l, 'inner holes', JSON.stringify(rp.internal_slides[0].drills.filter(d => d.surface === 'drawer_front').map(d => d.y)))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
