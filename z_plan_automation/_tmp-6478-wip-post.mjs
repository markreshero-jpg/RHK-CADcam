// RHK6478 WIP post-draw: 2pac room + sharknose (WC-01 PTO), WEP front fillers, TC-02 shelf unit 250 off the wall (box-out),
// tops (920: 20 + MA60 on 900 carcasses), sink / tap / D-W stand-ins, kicks joined, 18 shadowlines, pantry hinges in the inner drawer gaps.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae', DSPDR = 'e2a2d342-8475-4967-b1be-8387919acd1c'
const PAC = 'bd2b9178-5b77-4a52-b7a1-cc3765ed4bb4', PAC_TBC = '827dfe38-7cb7-4c02-aa87-6916b09876f5', PAC_BOARD = 'b07a7e40-facd-4cdf-8856-60712e940b44'
const SHARK = '243a2e18-5966-409f-8fec-f056006d5a61', PTO = '9440a3f0-63db-4085-9042-1c728298b49a', MA60 = '59a7169d-761a-414d-82b0-bd8ea7123853'
const mode = process.argv[2] ?? 'all'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,hardware_overrides,pos_x,pos_y,face_grid').eq('room_id', R))
const id = Object.fromEntries(cabs.map(c => [c.label, c.id])), by = l => cabs.find(c => c.label === l)
const walls = chk('walls', await sb.from('walls').select('id,name').eq('room_id', R)), W = Object.fromEntries(walls.map(w => [w.name, w.id]))
const fx = []
if (mode !== 'canvas') {
  chk('room', await sb.from('rooms').update({ base_door_style_id: PAC, base_door_colour_id: PAC_TBC, tall_door_style_id: PAC, tall_door_colour_id: PAC_TBC,
    wall_door_style_id: PAC, wall_door_colour_id: PAC_TBC, handle_schedule_id: SHARK }).eq('id', R))
  chk('rm del', await sb.from('room_materials').delete().eq('room_id', R))
  chk('rm', await sb.from('room_materials').insert(['base', 'tall', 'wall'].map(c => ({ room_id: R, assembly_class: c, material_role: 'exposed', material_id: PAC_BOARD }))))
  chk('WC-01', await sb.from('cabinet_instances').update({ hardware_overrides: { ...(by('WC-01').hardware_overrides ?? {}), handle_schedule_id: PTO } }).eq('id', id['WC-01']))
  for (const l of ['WC-03', 'WC-04']) chk(l, await sb.from('cabinet_custom_parts').update({ orientation: 'front', expressions: { z: 'cab.d + 2', dx: 'cab.w', dy: 'cab.h', dz: 't.exposed' } }).eq('cabinet_instance_id', id[l]).eq('name', 'Applied Panel'))
  // shelf unit in front of the 200 x 200 box-out: 250 off Wall 2, front flush with the 650 run
  chk('TC-02', await sb.from('cabinet_instances').update({ pos_y: 250 }).eq('id', id['TC-02']))
  // tops: Wall 2 face y 0 (x 1236-2351), Wall 5 face y 2202 running west from x 2351 (offsets 0-1400 -> x 2351-951)
  const sched = chk('sched', await sb.from('benchtop_instances').select('benchtop_schedule_id').eq('room_id', DSPDR).single()).benchtop_schedule_id
  chk('top del', await sb.from('benchtop_instances').delete().eq('room_id', R))
  const A = { wall: false, profile_id: MA60 }
  const top = (label, wall, pts, edges, notes) => sb.from('benchtop_instances').insert({ room_id: R, label, wall_id: wall, wall_side: 'face', height_mm: 900, benchtop_schedule_id: sched, notes,
    polygon: pts, edge_tags: [], join_types: [], arc_segments: [], cutout_polygons: [], joins: [], segments: pts.map((p0, i) => ({ type: 'line', p0, p1: pts[(i + 1) % pts.length], edge: edges[i] })) })
  chk('top1', await top('Benchtop 1', W['Wall 2'], [{ x: 1236, y: 0 }, { x: 2351, y: 0 }, { x: 2351, y: 650 }, { x: 1236, y: 650 }], [{ wall: true }, { wall: true }, A, { wall: true }],
    '60 finished: 20mm YDL Bella Oro + 60 mitred apron, 1115 x 650 from the fridge panel to Wall 3, top 920 AFF. Stone splashback.'))
  chk('top2', await top('Benchtop 2', W['Wall 5'], [{ x: 951, y: 1552 }, { x: 2351, y: 1552 }, { x: 2351, y: 2202 }, { x: 951, y: 2202 }], [A, { wall: true }, { wall: true }, { wall: true }],
    '60 finished: 20mm YDL Bella Oro + 60 mitred apron, 1400 x 650 from Wall 4 to the pantry panel, top 920 AFF. Abey Piazza CR540 590 x 450 undermount. Stone splashback.'))
  // fixtures (catalogue stand-ins renamed to the scheduled models)
  const keep = Object.keys(chk('ds', await sb.from('room_fixtures').select('*').eq('room_id', DSPDR).limit(1))[0])
  const fromCat = async (catId, over) => {
    const c = chk('cat', await sb.from('fixture_catalog').select('*').eq('id', catId).single())
    const row = Object.fromEntries(Object.entries(c).filter(([k]) => keep.includes(k) && !['id', 'created_at', 'updated_at'].includes(k)))
    return { ...row, catalog_id: catId, room_id: R, rotation: 180, link_x: 0, link_z: 0, link_rot: 0, cabinet_id: null, hinge_side: 'left', swing: 'in', wall_id: W['Wall 5'], ...over }
  }
  chk('fx del', await sb.from('room_fixtures').delete().eq('room_id', R))
  const SX = 2351 - 630 - 385   // sink centre x (centred on BC-04)
  for (const f of [
    await fromCat('42d89ce0-4507-4b2a-aa8c-c7ac11f8f8f1', { name: 'Abey Piazza CR540 590 x 450 U/M with drainer tray (drawn as Abi Seba)', brand: 'Abey', model_no: 'CR540', width: 590, depth: 450, x: SX - 295, y: 2202 - 325 - 225, z: 900 - 205, bench_drop: 205 }),
    await fromCat('c8170123-0e37-437c-a3d0-36e091b5c589', { name: 'V&B LF Vita pull-out mixer 213880 (drawn as Abi pull-out)', brand: 'Villeroy & Boch', model_no: '213880', x: SX - 58.5, y: 2202 - 20 - 267.5, z: 920 }),
    await fromCat('e6e5b580-3602-4897-9f68-63b991f10d13', { name: 'Bosch SMV6HCX03A integrated D/W (drawn as generic 600) - 25 packer', brand: 'Bosch', model_no: 'SMV6HCX03A', width: 598, depth: 550, height: 815, x: 2351 - 630 + 1, y: 2202 - 550 - 20, z: 25 }),
  ]) fx.push(...chk('fx', await sb.from('room_fixtures').insert(f).select('id,name,x,y')))
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
  const api = (fn, ...a) => Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]), sleep(60000).then(() => 'TIMEOUT')])
  await open()
  for (const l of ['BC-01', 'TC-05']) { console.log('join', l, JSON.stringify(await api('joinKicks', l))); await sleep(3000) }
  let st = await api('getState')
  for (const [wall, off, dx, dz, what] of [['Wall 2', 0, 1236, 630, 'shelf unit + fridge'], ['Wall 2', 1236, 1115, 350, 'open shelves'], ['Wall 5', 0, 1400, 330, 'overheads'], ['Wall 5', 1400, 948, 630, 'pantry']]) {
    if (!st.cabinets.some(c => c.wall === wall && Math.abs(c.offset - off) < 1 && Math.abs(c.dx - dx) < 1 && c.dy < 100)) { await api('placeCabinet', { def: 'BHSL', wall, offset: off, dx }); await sleep(1200) }
    st = await api('getState')
    const b = st.cabinets.find(c => c.wall === wall && Math.abs(c.offset - off) < 1 && Math.abs(c.dx - dx) < 1 && /^WC/.test(c.label) && (c.dy < 100 || c.def === 'BHSL') && !['WC-01', 'WC-02', 'WC-05'].includes(c.label))
    if (!b) { console.log('no BHSL', wall, off); continue }
    chk('sl', await sb.from('cabinet_instances').update({ bulkhead: { kind: 'shadowline', front: 'carcase', width: 60, cleat: false, auto_h: false,
      left: { on: false, depth: dz, joint: 'mitre' }, right: { on: false, depth: dz, joint: 'mitre' }, bottom: { on: false, depth: dz, joint: 'mitre' } }, notes: `18 2pac shadowline over the ${what}, 2362-2380` }).eq('id', b.id))
    await api('updateCabinet', b.id, { dy: 18, dz }); await sleep(1000)
  }
  // pantry hinges in the inner drawer gaps (door bottom frame), next one 70 over the fixed shelf, top one near the top
  const fg = chk('fg', await sb.from('cabinet_instances').select('face_grid').eq('id', id['TC-05']).single()).face_grid
  fg.zones = fg.zones.map(z => z.face_type === 'door' ? { ...z, hinges: [2140, 1520, 739, 219] } : z)
  chk('hinges', await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', id['TC-05']))
  await open()
  st = await api('getState')
  for (const c of st.cabinets) { await api('updateCabinet', c.label, { dz: c.dz }); await sleep(800) }
  if (!fx.length) fx.push(...chk('fx', await sb.from('room_fixtures').select('id,name,x,y').eq('room_id', R)))
  for (const f of fx) { await api('updateFixture', f.id, { x: Number(f.x), y: Number(f.y) }); await sleep(900) }
  st = await api('getState')
  for (const c of st.cabinets) console.log(c.label, c.wall, c.offset, c.dx, c.dy, c.dz)
  for (const f of st.fixtures ?? []) console.log('fixture', f.name, JSON.stringify({ x: f.x, y: f.y, cab: f.cabinet, clash: f.clash }))
  const rp = await api('getResolved', 'TC-05')
  console.log('TC-05 fixed', JSON.stringify((rp.internal_parts ?? []).filter(p => /fixed/.test(p.part_key ?? '')).map(p => [p.Y, p.DZ])), 'drawers', JSON.stringify((rp.drawer_stacks ?? []).map(s => s.box_Y)))
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
