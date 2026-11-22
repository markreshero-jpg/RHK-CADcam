// RHK6593 Alfresco Kitchen (Mark 2026-11-23): BBQ = Weber Baby Q Q1200N, portable, on the top over BC-04.
// Gas bottle in BC-04 (no shelf), 60 hose hole through the top. Edits in place, nothing deleted.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ok = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); console.log('ok', t); return r.data }
const R = 'daf418a3-f01d-48dd-abe4-053e6a97b084', WALL = '36fb3ffd-e81d-4406-a277-51a36dd467cd'
const BC04 = '73307bb7-d525-40e5-802e-222fcc13d935', NOTE = '45f61be0-0eb9-4fcf-9df8-a26ae0e2a7e2', TOP = 'fc32e24c-8a8e-4869-93e7-8c216c235664'
const NAME = 'Weber Baby Q Premium Q1200N LPG BBQ'
const KEYS = ['category', 'kind', 'name', 'brand', 'model_no', 'width', 'depth', 'height', 'mount', 'colour', 'model_url', 'model_format', 'model_scale', 'model_rot_x', 'model_rot_y', 'model_off_x', 'model_off_y', 'model_off_z', 'cutout_shape', 'cutout_w', 'cutout_d', 'cutout_radius', 'cutout_off_x', 'cutout_off_y', 'cut_benchtop', 'bench_drop', 'plan_shape', 'elev_shape', 'resizable', 'stretch']

// 1. Library item (no hole on the library row: a hose hole is per install).
let item = (await sb.from('fixture_catalog').select('*').eq('name', NAME).maybeSingle()).data
if (!item) {
  const src = ok('weber q row', await sb.from('fixture_catalog').select('*').eq('id', '03bdef6c-bd28-436a-bb10-20cb51b7e0f3').single())
  const { id, created_at, updated_at, ...body } = src
  item = ok('catalog insert', await sb.from('fixture_catalog').insert({ ...body, name: NAME, model_no: 'Q1200N Charcoal Grey', width: 1050, depth: 440, height: 380,
    colour: '#4B4E52', model_url: '/fixture-models/Weber_BabyQ_Q1200N_CharcoalGrey.glb', sort_order: 25,
    notes: 'Charcoal Grey. Portable benchtop BBQ, NOT a built-in (manual: do not build in). 1050 incl. both side tables x 440 x 380 lid closed; lid open 640 high x 560 deep. LPG, 9 kg bottle max, 1 m hose. 610 clear of combustibles. Model = the QX2800N+ shape sized to the Baby Q. Hose hole in the top: add a round cut-out on the placed item.' }).select().single())
}
console.log('catalog', item.id)

// 2. Placed BBQ, centred on BC-04 (1368-2214), back 130 off the wall (lid opens back to 560 deep), on the 900 top.
//    Hose hole 60 dia, 330 right of the BBQ centre (under the right side table, inside BC-04), 250 off the wall.
let fx = (await sb.from('room_fixtures').select('id').eq('room_id', R).eq('catalog_id', item.id).maybeSingle()).data
if (!fx) {
  const body = Object.fromEntries(KEYS.map(k => [k, item[k] ?? null]))
  fx = ok('fixture insert', await sb.from('room_fixtures').insert({ room_id: R, catalog_id: item.id, ...body,
    cutout_shape: 'round', cutout_w: 60, cutout_d: 0, cutout_radius: 0, cutout_off_x: 330, cutout_off_y: -100, cut_benchtop: true,
    label: 'Weber Baby Q Premium Q1200N LPG, Charcoal Grey (portable, sits on the top)',
    x: 1266, y: 130, z: 900, rotation: 0, wall_id: WALL }).select('id').single())
}

// 3. BC-04: shelf out for the gas bottle.
ok('BC-04', await sb.from('cabinet_instances').update({ internal_grid: { tree: { type: 'open', fittings: [] } },
  notes: 'Gas bottle cupboard (9 kg max) under the portable BBQ. No shelf. Hose comes down through a 60 hole in the top. Vents TBC.' }).eq('id', BC04))

// 4. CAD: the old BBQ note updated in place + a note inside BC-04.
ok('note', await sb.from('room_annotations').update({ text: 'PORTABLE BBQ ON TOP - 60 DIA HOSE HOLE IN TOP' }).eq('id', NOTE))
const TXT = '9KG GAS BOTTLE\nNO SHELF - VENTS TBC'
if (!(await sb.from('room_annotations').select('id').eq('room_id', R).eq('text', TXT).maybeSingle()).data)
  ok('bottle note', await sb.from('room_annotations').insert({ room_id: R, view: 'elevation', wall_id: WALL, wall_side: 'face', kind: 'text',
    geom: { at: { x: 1398, y: -340 }, width: 39.3 }, text: TXT, style: { size: 2.5, align: 'center' }, sort_order: 5 }))
ok('top notes', await sb.from('benchtop_instances').update({ notes: 'Smartstone Sintered Range 20mm, Colour TBC (White). 2600 x 700, 900 off the floor. Flush over the end panels, 5 over the fingerpull fronts. Runs over the 550 wine fridge space. No BBQ cut-out (portable Weber Baby Q sits on the top); 60 dia gas hose hole over BC-04. Sink cut-out TBC.' }).eq('id', TOP))

// 5. Through the app: link the BBQ to BC-04, re-resolve BC-04, report, plan shot.
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu', '--window-size=1800,1100'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1800, height: 1100 })
  page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(5000)
  await page.evaluate(id => window.__canvasApi.updateFixture(id, { x: 1266, y: 130 }), fx.id); await sleep(1500)
  await page.evaluate(() => window.__canvasApi.updateCabinet('BC-04', { dz: 675 })); await sleep(3000)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const f of st.fixtures ?? []) console.log('FIXTURE', f.name, JSON.stringify({ x: f.x, y: f.y, z: f.z, rot: f.rotation, cab: f.cabinet, clash: f.clash }))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  console.log('ISSUES', JSON.stringify(issues).slice(0, 1500))
  if (process.argv[2]) await page.screenshot({ path: process.argv[2] })
} finally { await browser.close() }
const c = await sb.from('cabinet_instances').select('label,pos_z,dy,dz,internal_grid').eq('id', BC04).single()
console.log('BC-04', JSON.stringify(c.data))
const ip = await sb.from('internal_parts').select('part_key').eq('cabinet_instance_id', BC04)
console.log('BC-04 internal parts', JSON.stringify(ip.data))
const f2 = await sb.from('room_fixtures').select('x,y,z,cabinet_id,link_x,link_z,cutout_shape,cutout_w').eq('id', fx.id).single()
console.log('fixture row', JSON.stringify(f2.data))
