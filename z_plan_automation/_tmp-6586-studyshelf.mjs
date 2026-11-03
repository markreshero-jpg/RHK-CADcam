// Temp: RHK6586 study rev (Mark 2026-10-31): waterfall -> 45° open corner shelf; drawer widened to meet it,
// no handle, no carcass bottom. Step 1 DB, step 2 place via canvas bridge, step 3 patch + re-resolve.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd4fdad8f-bcbf-4c38-a6ad-b6e0cee7ca8d', W1 = '80221b30-8b47-43fc-9342-9aae0288c866', TOP = '6c7a2b4c-dedd-4b00-9c49-12b95e349916'
const MA40 = 'adc278a8-5caa-45a4-ae38-045c21bce82f'
const chk = (l, r) => { console.log(l, r.error ? 'ERR ' + r.error.message : 'ok ' + (r.data?.length ?? '')); if (r.error) process.exit(1) }
// Shelf: open 45 face 18 back (square to it) from the stone's 45 edge, right gable at 482 deep like the panels were.
const D = 482, SET = 18 * Math.SQRT2, W = +(D + SET).toFixed(1)        // W = 507.5
const tip = +SET.toFixed(2)

// 1. top: waterfall edge -> 40 mitred apron
const { data: top } = await sb.from('benchtop_instances').select('segments,notes').eq('id', TOP).single()
const segments = top.segments.map(s => s.edge?.profile_id === 'ec8720a4-d679-414f-8936-03679e555932' ? { ...s, edge: { ...s.edge, profile_id: MA40 } } : s)
chk('top', await sb.from('benchtop_instances').update({ segments,
  notes: 'Study desk 40 finished: 20mm stone (colour TBC) + 40 mitred apron on the front, right end and the 45 end, 500 deep, top at 750 AFFL. Open corner shelf under the 45 end (was a waterfall).' }).eq('id', TOP).select('id'))
// left end panels go — the shelf's right gable takes their place
chk('del BC-05/06', await sb.from('cabinet_instances').delete().eq('room_id', R).in('label', ['BC-05', 'BC-06']).select('id'))
// drawer: widen to the shelf gable, front face flush with it (dz 464 + 18), no handle, no bottom, top reveal 22 (front stops 2 under the apron)
const { data: dr } = await sb.from('cabinet_instances').select('face_grid,rule_overrides').eq('room_id', R).eq('label', 'BC-03').single()
const face_grid = { ...dr.face_grid, zones: dr.face_grid.zones.map(z => { const { finger_gap, ...rest } = z; return { ...rest, handle_id: 'none' } }) }
chk('BC-03', await sb.from('cabinet_instances').update({ pos_x: W, dx: +(1302 - W).toFixed(1), dz: 464, face_grid,
  rule_overrides: { ...dr.rule_overrides, REVT: 22 }, part_hide_views: { case_bottom: ['plan', 'elevation', '3d'] },
  notes: 'Floating desk drawer, no handle (opens from underneath), no carcass bottom. Butts the corner shelf gable.' }).eq('room_id', R).eq('label', 'BC-03').select('id'))

// 2. place a B1D at the corner via the real placement path
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let label
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 90000 }); await sleep(3000)
  const res = await page.evaluate(([w, dx]) => window.__canvasApi.placeCabinet({ def: 'B1D', wall: w, offset: 0, dx }), [W1, W])
  label = res?.label ?? res; console.log('placed', JSON.stringify(res))
  await sleep(3000)
  // 3. patch into the open corner shelf
  const { data: c } = await sb.from('cabinet_instances').select('id,label').eq('room_id', R).eq('label', label).single()
  const footprint = { params: {}, segments: [
    { type: 'line', p0: { x: tip, y: 0 }, p1: { x: W, y: 0 }, edge: { id: 'back', role: 'back' } },
    { type: 'line', p0: { x: W, y: 0 }, p1: { x: W, y: D }, edge: { id: 'right', role: 'side' } },
    { type: 'line', p0: { x: W, y: D }, p1: { x: tip, y: 0 }, edge: { id: 'front', role: 'front' } },
  ] }
  const third = +((710 - 2 * 16.5) / 3).toFixed(1)
  chk('shelf', await sb.from('cabinet_instances').update({ pos_x: 0, pos_z: 0, dx: W, dy: 710, dz: D, has_face: false, has_toekick: false, exposed_interior: true,
    top_type: 'full_top', left_neighbour_type: 'wall', right_neighbour_type: 'cabinet', footprint,
    internal_grid: { tree: { type: 'hsplit', children: [
      { size: third, section: { type: 'open', fittings: [] }, separator: 'fixed_shelf' },
      { size: third, section: { type: 'open', fittings: [] }, separator: 'fixed_shelf' },
      { section: { type: 'open', fittings: [] } }] } },
    notes: 'Study open corner shelf under the 45 end of the desk (replaces the waterfall). Open 45 face 18 back from the stone, Boston Oak all over, 2 fixed shelves, to the floor under the apron.' }).eq('id', c.id).select('id'))
  for (const l of [label, 'BC-03', 'BC-01', 'BC-02']) {
    const st = await page.evaluate(() => window.__canvasApi.getState())
    const cc = st.cabinets.find(x => x.label === l)
    await page.evaluate(([id, dz]) => window.__canvasApi.updateCabinet(id, { dz }), [cc.id, l === label ? D : cc.dz]); await sleep(1500)
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const c of issues) for (const e of [...c.errors, ...c.warnings]) console.log(`  ${c.label} ${e.code}: ${e.message}`)
} finally { await browser.close() }
