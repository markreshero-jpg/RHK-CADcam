// RHK6478 US Main Ensuite rev 1 (Mark 2026-11-01): 30 floor-to-ceiling TEPFs -> 33 end panels (2 x 16.5 glued) from the
// floating shelf underside to the apron underside, 495 deep; drawers 798 between them; shelf 1596 between; top wall to wall;
// 2 x Harmony Bassini 360 round x 115 (library Abi Lola, renamed + sized).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = '6e8f14c4-1325-4f07-b312-a6f9386d0245', L = 1662, P = 16.5
const SHELF_BOT = 213.5, APRON_BOT = 820 - 60, PANEL_D = 476.5 + 16.5 + 2   // 495 = carcass + front + buffer
const BASIN = '09bc5835-1ec5-44b2-96a7-adb97651d24a', BASIN_X = [408, 1264], BASIN_D = 360, BASIN_CY = 250
const sleep = ms => new Promise(r => setTimeout(r, ms))

// 1. old 30 panels out
chk('del', await sb.from('cabinet_instances').delete().eq('room_id', R).in('label', ['TC-01', 'TC-02']))
// 2. top wall to wall
const top = chk('top', await sb.from('benchtop_instances').select('id').eq('room_id', R))[0]
const MA60 = '59a7169d-761a-414d-82b0-bd8ea7123853', W = { wall: true }
const pts = [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: 500 }, { x: 0, y: 500 }]
const edges = [W, W, { wall: false, profile_id: MA60 }, W]
chk('top upd', await sb.from('benchtop_instances').update({ polygon: pts, segments: pts.map((p0, i) => ({ type: 'line', p0, p1: pts[(i + 1) % 4], edge: edges[i] })),
  notes: 'Vanity 60 finished: 20mm YDL Bella Oro stone + 60 mitred apron on the front, 1662 x 500 wall to wall, top at 820 AFFL. 2 x Harmony Bassini 360 round x 115 above-counter basins.' }).eq('id', top.id))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const open = async () => {
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  }
  const api = async (fn, ...args) => { const r = await page.evaluate(([fn, args]) => window.__canvasApi[fn](...args), [fn, args]); await sleep(900); return r }
  await open()
  // 3. drawers + shelf between the new panels
  await api('updateCabinet', 'BC-01', { offset: 2 * P, dx: 798 })
  await api('updateCabinet', 'BC-02', { offset: 2 * P + 798, dx: 798 })
  await api('updateCabinet', 'WC-01', { offset: 2 * P, dx: L - 4 * P })
  // 4. four 16.5 panels (pairs glued = 33)
  let st = await page.evaluate(() => window.__canvasApi.getState())
  const wall2 = st.walls.find(w => w.name === 'Wall 2')
  const before = new Set(st.cabinets.map(c => c.id))
  for (const off of [0, P, L - 2 * P, L - P]) await api('placeCabinet', { def: 'TEPF', wall: wall2.id, offset: off, dx: P })
  st = await page.evaluate(() => window.__canvasApi.getState())
  const panels = st.cabinets.filter(c => !before.has(c.id)).sort((a, b) => a.offset - b.offset)
  const lab = panels.map(p => p.label)
  const mate = [lab[1], lab[0], lab[3], lab[2]]
  for (const [i, p] of panels.entries()) {
    const note = `${i < 2 ? 'Left' : 'Right'} 33 end panel (${i % 2 ? 'outer' : 'wall side'} half): glue to ${mate[i]}, ${SHELF_BOT}-${APRON_BOT} AFF under the apron`
    const cps = chk('cps', await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', p.id))
    const part_comments = Object.fromEntries(cps.map(cp => [`custom_${cp.id}`, `GLUE TO ${mate[i]} = 33 END PANEL`]))
    chk('panel', await sb.from('cabinet_instances').update({ dx: P, dy: APRON_BOT - SHELF_BOT, dz: PANEL_D, pos_z: SHELF_BOT, notes: note, part_comments }).eq('id', p.id))
  }
  // 5. basins
  chk('fx del', await sb.from('room_fixtures').delete().eq('room_id', R).eq('category', 'sink'))
  const fcols = Object.keys(chk('fx tpl', await sb.from('room_fixtures').select('*').limit(1))[0])
  const c = chk('cat', await sb.from('fixture_catalog').select('*').eq('id', BASIN))[0]
  const NAME = 'Harmony Bassini Basin 360 Round x 115 (APB-03360-MW)'
  const rows = BASIN_X.map(cx => {
    const row = { room_id: R, catalog_id: BASIN, wall_id: wall2.id, rotation: 0 }
    for (const k of fcols) if (k in c && !['id', 'created_at', 'updated_at', 'room_id', 'wall_id', 'notes'].includes(k)) row[k] = c[k]
    return { ...row, name: NAME, display_name: 'Basin', brand: 'Harmony', model_no: 'APB-03360-MW', width: BASIN_D, depth: BASIN_D, height: 115,
      x: cx - BASIN_D / 2, y: BASIN_CY - BASIN_D / 2, z: 820 }
  })
  const fx = chk('fx', await sb.from('room_fixtures').insert(rows).select('id,x,y'))
  await open()
  for (const f of fx) await api('updateFixture', f.id, { x: Number(f.x), y: Number(f.y) })
  // 6. re-resolve everything
  st = await page.evaluate(() => window.__canvasApi.getState())
  for (const cb of st.cabinets) await api('updateCabinet', cb.label, { dz: cb.dz })
  st = await page.evaluate(() => window.__canvasApi.getState())
  for (const cb of st.cabinets) console.log(cb.label, cb.def ?? '', 'off', cb.offset, cb.dx, cb.dy, cb.dz, 'pos_z', cb.pos_z)
  for (const f of st.fixtures ?? []) console.log('fixture', f.name ?? f.display_name, JSON.stringify({ x: f.x, y: f.y, z: f.z, cab: f.cabinet, clash: f.clash }))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
