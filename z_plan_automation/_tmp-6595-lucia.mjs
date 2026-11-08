// Catalog: Abey Lucia LUA190PK 1 3/4 bowl sink (GLB from z_fixtures/make-lucia-sink-glb.mjs) + RHK6595's sink swapped
// to it in place (row kept, body replaced from the catalog), re-centred on BC-07 through updateFixture (re-link + cut-out).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ROOM = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', FIX = 'dda70361-28dd-456a-bbb1-00634152ded2'
const shapes = JSON.parse(fs.readFileSync('z_fixtures/Abey_Lucia_LUA190.shapes.json', 'utf8'))
const seba = (await sb.from('fixture_catalog').select('group_id,colour').eq('id', '42d89ce0-4507-4b2a-aa8c-c7ac11f8f8f1').single()).data
const NAME = 'Abey Lucia 1 3/4 Bowl Sink LUA190PK'
let cat = (await sb.from('fixture_catalog').select('*').eq('name', NAME)).data[0]
if (!cat) {
  const r = await sb.from('fixture_catalog').insert({
    category: 'sink', kind: 'Kitchen sink', name: NAME, brand: 'Abey', model_no: 'LUA190PK',
    width: 608, depth: 440, height: 200, mount: 'benchtop', colour: seba.colour, group_id: seba.group_id,
    model_url: '/fixture-models/Abey_Lucia_LUA190.glb', model_format: 'glb', model_scale: 1000,
    model_rot_x: 0, model_rot_y: 0, model_off_x: 0, model_off_y: 0, model_off_z: 0,
    cutout_shape: 'rect', cutout_w: 565, cutout_d: 400, cutout_radius: 10, cutout_off_x: 0, cutout_off_y: 0,
    cut_benchtop: true, bench_drop: 200, resizable: false, active: true, sort_order: 135, ...shapes,
    notes: 'Bowls 340 x 400 x 200 (left) + 225 x 400 x 160 (right), R15, 2 x 90 wastes, SUS304. Inset or undermount (clips supplied); cut-out 565 x 400 is the inset hole (Winnings) - check the template for undermount. Min cabinet 700. Spec: job APPLIANCES folder (RHK6595).',
  }).select('*').single()
  if (r.error) { console.error(r.error.message); process.exit(1) }
  cat = r.data
}
console.log('catalog', cat.id)
const BODY = ['category', 'kind', 'name', 'brand', 'model_no', 'width', 'depth', 'height', 'mount', 'colour', 'model_url', 'model_format', 'model_scale', 'model_rot_x', 'model_rot_y',
  'model_off_x', 'model_off_y', 'model_off_z', 'cutout_shape', 'cutout_w', 'cutout_d', 'cutout_radius', 'cutout_off_x', 'cutout_off_y', 'cut_benchtop', 'bench_drop', 'plan_shape', 'elev_shape', 'resizable', 'stretch']
const before = (await sb.from('room_fixtures').select('*').eq('id', FIX).single()).data
fs.writeFileSync('z_plan_automation/_tmp-6595-sink-before.json', JSON.stringify(before))
const body = Object.fromEntries(BODY.map(k => [k, cat[k] ?? null]))
console.log('fixture body', (await sb.from('room_fixtures').update({ ...body, catalog_id: cat.id }).eq('id', FIX)).error?.message ?? 'ok')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(6000)
  // BC-07 runs room x 1341.5 -> 641.5 (rot 180), centre 991.5; back-left corner of a 608 sink turned 180 = 991.5 + 304.
  console.log('update', JSON.stringify(await page.evaluate(id => window.__canvasApi.updateFixture(id, { x: 1295.5, y: 2631 }), FIX)))
  await sleep(4000)
  const f = (await page.evaluate(() => window.__canvasApi.getState())).fixtures.find(x => x.id === FIX)
  console.log('fixture', JSON.stringify({ name: f.name, x: f.x, y: f.y, rot: f.rotation, cabinet: f.cabinet, clash: f.clash }))
} finally { await browser.close() }
