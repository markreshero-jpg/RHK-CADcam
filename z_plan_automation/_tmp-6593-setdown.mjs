// RHK6593 Alfresco Kitchen (Mark 2026-11-25): Weber Baby Q set DOWN into a stone well over BC-04 so the grill
// plate is flush with the 900 top. Well open at the front, stone sides + back + bottom, side tables off.
// Set-down 215 is a PLACEHOLDER (feet to top of grill, Weber gives no figure) — Mark to measure.
// Edits in place, nothing deleted.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ok = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); console.log('ok', t); return r.data }
const R = 'daf418a3-f01d-48dd-abe4-053e6a97b084', WALL = '36fb3ffd-e81d-4406-a277-51a36dd467cd'
const BC04 = '73307bb7-d525-40e5-802e-222fcc13d935', NOTE = '45f61be0-0eb9-4fcf-9df8-a26ae0e2a7e2', BOTTLE = '807ac5f0-aaee-45db-8f18-c741bb86b62a'
const TOP = 'fc32e24c-8a8e-4869-93e7-8c216c235664', FX = 'cc30dbaf-98bb-4911-9423-075b1f99396c'

const DROP = 215, T = 20                    // set-down (TBC) and stone thickness
const X0 = 1368, X1 = 2214                  // BC-04
const WX0 = X0 + T, WX1 = X1 - T            // well inside faces: 806 wide
const WY = 110                              // well inside back face, off the wall (590 front to back)
const FLOOR = 900 - DROP                    // well floor top, 685 off the floor
const BODY_W = 660, BODY_D = 440

// 1. Edge profile: a stone side that drops to the well floor.
let prof = (await sb.from('benchtop_edge_profiles').select('*').eq('code', 'MA' + DROP).maybeSingle()).data
if (!prof) prof = ok('profile', await sb.from('benchtop_edge_profiles').insert({ name: `Mitred Apron ${DROP} (set-down well side)`, code: 'MA' + DROP, category: 'stone',
  description: `Stone side mitred to the top and dropping ${DROP} from the top surface, for a set-down well.`, generates: 'apron', apron_drop_mm: DROP, sort_order: 55, active: true }).select().single())

// 2. Main top: notch for the well, open at the front. The three notch edges carry the stone sides.
const pts = [[500, 0], [3100, 0], [3100, 700], [WX1, 700], [WX1, WY], [WX0, WY], [WX0, 700], [500, 700]].map(([x, y]) => ({ x, y }))
const well = new Set([3, 4, 5])
const segments = pts.map((p0, i) => ({ p0, p1: pts[(i + 1) % pts.length], type: 'line', edge: i === 0 ? { wall: true } : well.has(i) ? { wall: false, profile_id: prof.id } : { wall: false } }))
ok('top', await sb.from('benchtop_instances').update({ polygon: pts, segments,
  notes: `Smartstone Sintered Range 20mm, Colour TBC (White). 2600 x 700, 900 off the floor. Flush over the end panels, 5 over the fingerpull fronts. Runs over the 550 wine fridge space. BBQ SET-DOWN WELL over BC-04, open at the front: ${WX1 - WX0} wide x ${700 - WY} front to back inside the stone, ${DROP} deep (TBC - measure the BBQ feet to top of grill), stone sides + back mitred to the top, stone bottom (Benchtop 2). ${WY} of top left behind the well. Sink cut-out TBC.` }).eq('id', TOP))

// 3. Well bottom: its own stone piece on the lowered BC-04, under the sides.
const FL = 'BBQ well bottom'
let floor = (await sb.from('benchtop_instances').select('id').eq('room_id', R).eq('label', FL).maybeSingle()).data
const fp = [[X0, WY - T], [X1, WY - T], [X1, 700], [X0, 700]].map(([x, y]) => ({ x, y }))
const fbody = { polygon: fp, segments: fp.map((p0, i) => ({ p0, p1: fp[(i + 1) % 4], type: 'line', edge: { wall: false } })), height_mm: FLOOR - T,
  notes: `Stone bottom of the BBQ set-down well, ${X1 - X0} x ${700 - WY + T}, top face ${FLOOR} off the floor (${DROP} below the main top, TBC). Sides and back sit on it. 60 dia gas hose hole behind the BBQ, right side.` }
if (floor) ok('floor upd', await sb.from('benchtop_instances').update(fbody).eq('id', floor.id))
else {
  const main = ok('main', await sb.from('benchtop_instances').select('*').eq('id', TOP).single())
  floor = ok('floor', await sb.from('benchtop_instances').insert({ room_id: R, label: FL, edge_tags: [], join_types: [], arc_segments: [], cutout_polygons: [], joins: [],
    benchtop_build_method_id: main.benchtop_build_method_id, benchtop_schedule_id: main.benchtop_schedule_id, wall_id: WALL, wall_side: 'face', ...fbody }).select('id').single())
}

// 4. BC-04 lowered under the well bottom: carcass top at 665 (was 880). Kick already joined, so dy is the carcass only.
ok('BC-04', await sb.from('cabinet_instances').update({ dy: FLOOR - T - 140,
  notes: `Lowered cupboard under the BBQ set-down well (carcass top ${FLOOR - T}, stone bottom on it). Gas bottle, no shelf. Hose comes down through a 60 hole in the well bottom. Vents TBC.` }).eq('id', BC04))

// 5. BBQ: side tables off (660 body), feet on the well bottom, 20 back from the front edge, hose hole behind it.
const cur = ok('fx', await sb.from('room_fixtures').select('plan_shape,elev_shape').eq('id', FX).single())
const crop = sh => !sh?.lines ? sh : { ...sh, lines: sh.lines.map(l => l.map(([x, y]) => [Math.round(((Math.min(0.8, Math.max(0.2, x)) - 0.2) / 0.6) * 1e4) / 1e4, y])) }
const wide = (await sb.from('fixture_catalog').select('plan_shape,elev_shape').eq('id', '098f0ef3-ef0e-4290-8e7d-bdccefb2533c').single()).data
const FXX = (X0 + X1) / 2 - BODY_W / 2, FXY = 700 - T - BODY_D
ok('fixture', await sb.from('room_fixtures').update({ width: BODY_W, depth: BODY_D, x: FXX, y: FXY, z: FLOOR,
  plan_shape: crop(wide?.plan_shape ?? cur.plan_shape), elev_shape: crop(wide?.elev_shape ?? cur.elev_shape),
  model_url: '/fixture-models/Weber_BabyQ_Q1200N_CharcoalGrey_NoTables.glb',
  cutout_shape: 'round', cutout_w: 60, cutout_d: 0, cutout_radius: 0, cutout_off_x: 250, cutout_off_y: -(FXY + BODY_D / 2 - 175), cut_benchtop: true,
  label: 'Weber Baby Q Premium Q1200N LPG, Charcoal Grey (side tables off, set down in the stone well)' }).eq('id', FX))

// 6. CAD notes, updated in place.
ok('note', await sb.from('room_annotations').update({ text: `BBQ SET DOWN ${DROP} (TBC) IN STONE WELL - GRILL FLUSH WITH TOP`, geom: { at: { x: 1400, y: -1180 } } }).eq('id', NOTE))
ok('bottle note', await sb.from('room_annotations').update({ text: 'GAS BOTTLE\nNO SHELF - VENTS TBC', geom: { at: { x: 1398, y: -300 }, width: 39.3 } }).eq('id', BOTTLE))

// 7. Through the app: re-link the BBQ, re-resolve BC-04, report, shots.
const sleep = ms => new Promise(r => setTimeout(r, ms))
const out = process.argv[2]
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--window-size=1800,1100', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1800, height: 1100 })
  page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(5000)
  await page.evaluate((id, x, y) => window.__canvasApi.updateFixture(id, { x, y }), FX, FXX, FXY); await sleep(1500)
  await page.evaluate(() => window.__canvasApi.updateCabinet('BC-04', { dz: 675 })); await sleep(3000)
  let st = await page.evaluate(() => window.__canvasApi.getState())
  const f = (st.fixtures ?? []).find(f => f.id === FX) ?? (st.fixtures ?? [])[0]
  if (f && Math.abs(f.z - FLOOR) > 0.5) { console.log('z was', f.z, '-> set', FLOOR); await page.evaluate((id, z) => window.__canvasApi.updateFixture(id, { z }), FX, FLOOR); await sleep(1500); st = await page.evaluate(() => window.__canvasApi.getState()) }
  for (const f of st.fixtures ?? []) console.log('FIXTURE', f.name, JSON.stringify({ x: f.x, y: f.y, z: f.z, w: f.width, cab: f.cabinet, clash: f.clash }))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  console.log('ISSUES', JSON.stringify(issues).slice(0, 2500))
  if (out) {
    await page.screenshot({ path: out + '-plan.png' })
    for (const name of ['Elevation', '3D']) {
      const hit = await page.evaluate(n => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === n || b.textContent.trim().startsWith(n)); if (b) b.click(); return !!b }, name)
      console.log('click', name, hit); await sleep(6000)
      await page.screenshot({ path: `${out}-${name.toLowerCase()}.png` })
    }
  }
} finally { await browser.close() }
const c = await sb.from('cabinet_instances').select('label,pos_z,dy,dz').eq('id', BC04).single()
console.log('BC-04', JSON.stringify(c.data))
const cp = await sb.from('case_parts').select('*').eq('cabinet_instance_id', BC04)
console.log('BC-04 parts', JSON.stringify((cp.data ?? []).map(p => [p.part_key ?? p.name ?? p.part_type, p.dx, p.dy, p.dz])))
const f2 = await sb.from('room_fixtures').select('x,y,z,width,cabinet_id,link_x,link_z,cutout_off_x,cutout_off_y').eq('id', FX).single()
console.log('fixture row', JSON.stringify(f2.data))
