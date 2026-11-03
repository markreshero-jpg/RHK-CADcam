// RHK6478 Buffet post-draw: 2pac room finishes + sharknose, WC-02 open shelf unit in LX Board 33mm Sublime Teak with a whiteboard back,
// WEP front fillers, kick joined, 18 shadowline, 2345 x 600 YDL Bella Oro top (20 + MA60 apron) at 900.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = '0df13af4-8a6f-438f-a10d-6a9b4754aa97', DSPDR = 'e2a2d342-8475-4967-b1be-8387919acd1c'
const PAC = 'bd2b9178-5b77-4a52-b7a1-cc3765ed4bb4', PAC_TBC = '827dfe38-7cb7-4c02-aa87-6916b09876f5', PAC_BOARD = 'b07a7e40-facd-4cdf-8856-60712e940b44'
const SHARK = '243a2e18-5966-409f-8fec-f056006d5a61', TEAK33 = '8fae4f9c-02aa-4799-a46d-52be445d247d', WB = 'd081b2a1-38a8-472c-a415-f179699a1347'
const MA60 = '59a7169d-761a-414d-82b0-bd8ea7123853', L = 2345, D = 600
chk('room', await sb.from('rooms').update({ base_door_style_id: PAC, base_door_colour_id: PAC_TBC, tall_door_style_id: PAC, tall_door_colour_id: PAC_TBC,
  wall_door_style_id: PAC, wall_door_colour_id: PAC_TBC, handle_schedule_id: SHARK }).eq('id', R))
chk('rm del', await sb.from('room_materials').delete().eq('room_id', R))
chk('rm', await sb.from('room_materials').insert(['base', 'tall', 'wall'].map(c => ({ room_id: R, assembly_class: c, material_role: 'exposed', material_id: PAC_BOARD }))))
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label').eq('room_id', R))
const id = Object.fromEntries(cabs.map(c => [c.label, c.id]))
chk('WC-02', await sb.from('cabinet_instances').update({ material_overrides: { exposed: TEAK33, interior: TEAK33, shelf: TEAK33, back: WB } }).eq('id', id['WC-02']))
for (const l of ['WC-01', 'WC-04']) chk(l, await sb.from('cabinet_custom_parts').update({ orientation: 'front', expressions: { z: 'cab.d + 2', dx: 'cab.w', dy: 'cab.h', dz: 't.exposed' } }).eq('cabinet_instance_id', id[l]).eq('name', 'Applied Panel'))
const wall = chk('wall', await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).id
const sched = chk('sched', await sb.from('benchtop_instances').select('benchtop_schedule_id').eq('room_id', DSPDR).single()).benchtop_schedule_id
chk('top del', await sb.from('benchtop_instances').delete().eq('room_id', R))
const pts = [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: D }, { x: 0, y: D }], edges = [{ wall: true }, { wall: true }, { wall: false, profile_id: MA60 }, { wall: true }]
chk('top', await sb.from('benchtop_instances').insert({ room_id: R, label: 'Benchtop 1', wall_id: wall, wall_side: 'face', height_mm: 880, benchtop_schedule_id: sched,
  notes: '60 finished: 20mm YDL Bella Oro + 60 mitred apron on the front, 2345 x 600 wall to wall, top 900 AFF. Spans the bar fridge bays.',
  polygon: pts, edge_tags: [], join_types: [], arc_segments: [], cutout_polygons: [], joins: [], segments: pts.map((p0, i) => ({ type: 'line', p0, p1: pts[(i + 1) % 4], edge: edges[i] })) }))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = (fn, ...a) => Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]), sleep(60000).then(() => 'TIMEOUT')])
  console.log('join', JSON.stringify(await api('joinKicks', 'BC-03'))); await sleep(3000)
  let st = await api('getState')
  if (!st.cabinets.some(c => c.dy < 100 && /^WC/.test(c.label))) { console.log(JSON.stringify(await api('placeCabinet', { def: 'BHSL', wall: 'Wall 2', offset: 0, dx: L }))); await sleep(1500); st = await api('getState') }
  const sl = st.cabinets.find(c => /^WC/.test(c.label) && Math.abs(c.dx - L) < 1)
  chk('sl', await sb.from('cabinet_instances').update({ bulkhead: { kind: 'shadowline', front: 'carcase', width: 60, cleat: false, auto_h: false,
    left: { on: false, depth: 350, joint: 'mitre' }, right: { on: false, depth: 350, joint: 'mitre' }, bottom: { on: false, depth: 350, joint: 'mitre' } }, notes: '18 2pac shadowline 2372-2390, wall to wall' }).eq('id', sl.id))
  await api('updateCabinet', sl.id, { dy: 18, dz: 350 }); await sleep(1200)
  st = await api('getState')
  for (const c of st.cabinets) { await api('updateCabinet', c.label, { dz: c.dz }); await sleep(900) }
  st = await api('getState')
  for (const c of st.cabinets) console.log(c.label, c.offset, c.dx, c.dy, c.dz)
  for (const l of ['WC-02', 'BC-03']) {
    const rp = await api('getResolved', l)
    console.log(l, JSON.stringify([...rp.case_parts.map(p => [p.part_key, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)]), ...(rp.internal_parts ?? []).map(p => [p.part_key ?? p.type, p.DZ, p.material_id?.slice(0, 8)]), ...rp.face_zones.map(z => ['face', z.DY, z.material_id?.slice(0, 8), z.handle?.grip_kind])]))
  }
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
