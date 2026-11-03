// RHK6478 US Main Ensuite: room fronts (Lx Sublime Teak Chalk), finger pull schedule, exposed panels in Chalk, 60 stone top, re-resolve + report.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '6e8f14c4-1325-4f07-b312-a6f9386d0245'
const LX16 = '8ffd3162-6b06-4abf-9f00-e05caf04eb79', TEAK = '5fdb0fa7-e212-49aa-b8e6-044210033c85', TEAK_MAT = '67ecbeff-98ac-41e1-9b1a-618a5bf6a96b'
const mode = process.argv[2] ?? 'check'
if (mode === 'setup') {
  console.log('room', (await sb.from('rooms').update({ base_door_style_id: LX16, base_door_colour_id: TEAK, tall_door_style_id: LX16, tall_door_colour_id: TEAK, wall_door_style_id: LX16, wall_door_colour_id: TEAK,
    handle_schedule_id: '243a2e18-5966-409f-8fec-f056006d5a61' }).eq('id', R)).error?.message ?? 'ok')
  await sb.from('room_materials').delete().eq('room_id', R).eq('material_role', 'exposed')
  console.log('exposed', (await sb.from('room_materials').insert(['base', 'wall', 'tall'].map(c => ({ room_id: R, assembly_class: c, material_role: 'exposed', material_id: TEAK_MAT })))).error?.message ?? 'ok')
  const wall = (await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).data.id
  const MA60 = '59a7169d-761a-414d-82b0-bd8ea7123853', W = { wall: true }
  const pts = [{ x: 30, y: 0 }, { x: 1632, y: 0 }, { x: 1632, y: 500 }, { x: 30, y: 500 }]
  const edges = [W, W, { wall: false, profile_id: MA60 }, W]   // back wall, right panel, front apron, left panel
  await sb.from('benchtop_instances').delete().eq('room_id', R)
  console.log('top', (await sb.from('benchtop_instances').insert({ room_id: R, label: 'Benchtop 1', wall_id: wall, wall_side: 'face', height_mm: 800, benchtop_schedule_id: 'da288276-4dfc-4410-b6f6-d53d1b38c8fd',
    notes: 'Vanity 60 finished: 20mm YDL Bella Oro stone + 60 mitred apron on the front, 1602 x 500 between the end panels, top at 820 AFFL. 2 x 115 above-counter basins (taps 407 / 414 in).',
    polygon: pts, edge_tags: [], join_types: [], arc_segments: [], cutout_polygons: [], joins: [],
    segments: pts.map((p0, i) => ({ type: 'line', p0, p1: pts[(i + 1) % 4], edge: edges[i] })) })).error?.message ?? 'ok')
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  let st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [c.label, c.dz]); await sleep(1000) }
  st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) console.log(c.label, c.dx, c.dy, c.dz, 'pos_z', c.pos_z)
  for (const l of ['BC-01', 'TC-01', 'TC-02', 'TC-03', 'TC-04', 'WC-01']) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    if (!rp) { console.log(l, 'no resolved'); continue }
    console.log(l, 'case', JSON.stringify(rp.case_parts.map(p => [p.part_key, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)])))
    if (rp.face_zones.length) console.log(l, 'zones', JSON.stringify(rp.face_zones.map(z => [z.face_type, 'Y', z.Y, 'DY', z.DY, 'DZ', z.DZ, z.material_id?.slice(0, 8), z.handle?.grip_kind ?? 'none'])))
    if (rp.drawer_stacks?.length) console.log(l, 'boxes', JSON.stringify(rp.drawer_stacks.map(s => s.box_parts?.map(p => [p.part_type, p.DX, p.DY])?.slice(0, 2))))
    if (rp.custom_parts?.length) console.log(l, 'custom', JSON.stringify(rp.custom_parts.map(p => [p.name ?? p.part_key, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)])))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const c of issues) for (const e of [...c.errors, ...c.warnings]) console.log(`  ${c.label} ${e.code}: ${e.message}`)
} finally { await browser.close() }
