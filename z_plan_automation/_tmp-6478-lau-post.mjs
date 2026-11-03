// RHK6478 Laundry post-draw: handles per cabinet, PDR fillers Chalk, washer top 2pac, WEP -> front filler,
// kicks joined, YDL Bella Oro tops (tub wall 1970 x 700 @ 900, PDR 980 x 500 @ 820), sink + tap + PDR basin.
// node _tmp-6478-lau-post.mjs [db|canvas|all]
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const mode = process.argv[2] ?? 'all'
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc', DSPDR = 'e2a2d342-8475-4967-b1be-8387919acd1c'
const SETBACK = '69316467-c1e2-4e55-a680-3eb8217c40fc', PTO = '9440a3f0-63db-4085-9042-1c728298b49a'
const PAC_BOARD = 'b07a7e40-facd-4cdf-8856-60712e940b44', TEAK_BOARD = '67ecbeff-98ac-41e1-9b1a-618a5bf6a96b'
const MA60 = '59a7169d-761a-414d-82b0-bd8ea7123853'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,hardware_overrides').eq('room_id', R))
const id = Object.fromEntries(cabs.map(c => [c.label, c.id]))
const walls = chk('walls', await sb.from('walls').select('id,name').eq('room_id', R))
const W = Object.fromEntries(walls.map(w => [w.name, w.id]))
const fx = []

if (mode === 'db' || mode === 'all') {
  // 1. handles: overheads + PDR vanity set back SQ edge, talls + tower top PTO (markup); room = sharknose
  for (const [l, h] of [['WC-02', SETBACK], ['WC-03', SETBACK], ['BC-07', SETBACK], ['TC-04', PTO], ['TC-07', PTO], ['TC-08', PTO]]) {
    const c = cabs.find(x => x.label === l)
    chk(l, await sb.from('cabinet_instances').update({ hardware_overrides: { ...(c.hardware_overrides ?? {}), handle_schedule_id: h } }).eq('id', c.id))
  }
  // 2. custom part boards: PDR fillers Chalk, washer top 2pac; WEP -> front filler in the door plane
  const cp = async l => chk('cp ' + l, await sb.from('cabinet_custom_parts').select('id,name').eq('cabinet_instance_id', id[l]))
  for (const l of ['TC-10', 'TC-11']) for (const p of await cp(l)) chk(l, await sb.from('cabinet_custom_parts').update({ material_id: TEAK_BOARD }).eq('id', p.id))
  for (const p of await cp('WC-01')) chk('WC-01', await sb.from('cabinet_custom_parts').update({ material_id: PAC_BOARD }).eq('id', p.id))
  chk('WC-05', await sb.from('cabinet_custom_parts').update({ orientation: 'front', expressions: { z: 'cab.d + 2', dx: 'cab.w', dy: 'cab.h', dz: 't.exposed' } }).eq('cabinet_instance_id', id['WC-05']).eq('name', 'Applied Panel'))
  // 3. tops (room frame). Wall 2 face y 0 from x 832; Wall 4 face y 2278 running west from x 2656.
  const sched = chk('sched', await sb.from('benchtop_instances').select('benchtop_schedule_id').eq('room_id', DSPDR).single()).benchtop_schedule_id
  chk('top del', await sb.from('benchtop_instances').delete().eq('room_id', R))
  const top = (label, wall, pts, edges, h, notes) => sb.from('benchtop_instances').insert({ room_id: R, label, wall_id: wall, wall_side: 'face', height_mm: h, benchtop_schedule_id: sched, notes,
    polygon: pts, edge_tags: [], join_types: [], arc_segments: [], cutout_polygons: [], joins: [],
    segments: pts.map((p0, i) => ({ type: 'line', p0, p1: pts[(i + 1) % pts.length], edge: edges[i] })) })
  const A = { wall: false, profile_id: MA60 }
  chk('top1', await top('Benchtop 1', W['Wall 2'], [{ x: 1518, y: 0 }, { x: 3488, y: 0 }, { x: 3488, y: 700 }, { x: 1518, y: 700 }],
    [{ wall: true }, { wall: true }, A, { wall: true }], 880,
    '60 finished: 20mm YDL Bella Oro + 60 mitred apron on the front, 1970 x 700 from the tower panel to Wall 6, top 900 AFF. Dali Tanawha YH5444AR R15 540 x 440 undermount. Stone splashback to the overheads.'))
  chk('top2', await top('Benchtop 2', W['Wall 4'], [{ x: -238, y: 1778 }, { x: 742, y: 1778 }, { x: 742, y: 2278 }, { x: -238, y: 2278 }],
    [A, { wall: true }, { wall: true }, { wall: true }], 800,
    'PDR vanity 60 finished: 20mm YDL Bella Oro + 60 mitred apron on the front, 980 x 500 Nib 1 to Wall 5, top 820 AFF (140 basin finishes 960).'))
  // 4. fixtures: catalogue copies (sink + tap stand-ins renamed to the scheduled models), PDR basin as the DS Powder
  const keep = Object.keys(chk('ds', await sb.from('room_fixtures').select('*').eq('room_id', DSPDR).limit(1))[0])
  const fromCat = async (catId, over) => {
    const c = chk('cat', await sb.from('fixture_catalog').select('*').eq('id', catId).single())
    const row = Object.fromEntries(Object.entries(c).filter(([k]) => keep.includes(k) && !['id', 'created_at', 'updated_at'].includes(k)))
    return { ...row, catalog_id: catId, room_id: R, rotation: 0, link_x: 0, link_z: 0, link_rot: 0, cabinet_id: null, hinge_side: 'left', swing: 'in', ...over }
  }
  chk('fx del', await sb.from('room_fixtures').delete().eq('room_id', R).in('category', ['sink', 'tap']))
  const sink = await fromCat('42d89ce0-4507-4b2a-aa8c-c7ac11f8f8f1', { name: 'Dali Tanawha YH5444AR R15 540 x 440 (drawn as Abi Seba)', brand: 'Dali', model_no: 'YH5444AR R15', width: 540, depth: 440, wall_id: W['Wall 2'], x: 832 + 1171 - 270, y: 360 - 220, z: 900 })
  const tap = await fromCat('c8170123-0e37-437c-a3d0-36e091b5c589', { name: 'V&B LF Vita pull-out mixer 213880 (drawn as Abi pull-out)', brand: 'Villeroy & Boch', model_no: '213880', wall_id: W['Wall 2'], x: 832 + 1171 - 58.5, y: 20, z: 900 })
  const bas = chk('bas', await sb.from('room_fixtures').select('*').eq('room_id', DSPDR).eq('category', 'sink'))[0]
  const { id: _i, created_at, updated_at, room_id, wall_id, cabinet_id, link_x, link_z, lock_group, ...rest } = bas
  const basin = { ...rest, room_id: R, wall_id: W['Wall 4'], name: 'PDR basin x 140 (model TBC)', model_no: null, height: 140, cabinet_id: null, link_x: 0, link_z: 0,
    x: 2656 - 2404 - Number(bas.width) / 2, y: 2278 - 250 - Number(bas.depth) / 2, z: 820, rotation: 180 }
  for (const f of [sink, tap, basin]) fx.push(...chk('fx ins', await sb.from('room_fixtures').insert(f).select('id,name,x,y')))
  console.log('fixtures', fx.map(f => f.name))
}

if (mode === 'canvas' || mode === 'all') {
  if (!fx.length) fx.push(...chk('fx', await sb.from('room_fixtures').select('id,name,x,y').eq('room_id', R)))
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
  try {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
    page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(2500)
    for (const l of ['BC-02', 'TC-07']) { console.log('join', JSON.stringify(await page.evaluate(l => window.__canvasApi.joinKicks(l), l))); await sleep(3000) }
    for (const f of fx) { await page.evaluate(([id, x, y]) => window.__canvasApi.updateFixture(id, { x, y }), [f.id, Number(f.x), Number(f.y)]); await sleep(900) }
    let st = await page.evaluate(() => window.__canvasApi.getState())
    for (const c of st.cabinets) { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [c.label, c.dz]); await sleep(900) }
    st = await page.evaluate(() => window.__canvasApi.getState())
    for (const c of st.cabinets) console.log(c.label, c.wall, c.offset, c.dx, c.dy, c.dz, 'z', c.pos_z ?? '')
    for (const f of st.fixtures ?? []) console.log('fixture', f.name, JSON.stringify({ x: f.x, y: f.y, z: f.z, cab: f.cabinet, clash: f.clash }))
    const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
    for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
    console.log('issues', n)
  } finally { await browser.close() }
}
