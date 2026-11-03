// RHK6478 DS Powder rev 1 (Mark 2026-11-02): open shelf bays 200, drawers 942.5, basin 600 off the RIGHT wall;
// delete the empty duplicate room from the failed first run.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'e2a2d342-8475-4967-b1be-8387919acd1c', DUP = '44570a9c-d50b-4d7c-8af1-479db845fe45'
// 1. duplicate room (empty: no cabinets)
const dupCabs = chk('dup cabs', await sb.from('cabinet_instances').select('id').eq('room_id', DUP))
if (dupCabs.length) throw new Error('duplicate room has cabinets - not deleting')
chk('dup walls', await sb.from('walls').delete().eq('room_id', DUP))
console.log('deleted dup', chk('dup room', await sb.from('rooms').delete().eq('id', DUP).select('id')).length)
// 2. bays
const want = { 'BC-01': [33, 200], 'BC-02': [233, 942.5], 'BC-03': [1175.5, 942.5], 'BC-04': [2118, 200] }
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label').eq('room_id', R))
const id = Object.fromEntries(cabs.map(c => [c.label, c.id]))
for (const [l, [x, dx]] of Object.entries(want)) chk(l, await sb.from('cabinet_instances').update({ pos_x: x, dx }).eq('id', id[l]))
// 3. basin 600 off the right wall
const bas = chk('bas', await sb.from('room_fixtures').select('id,width').eq('room_id', R).eq('category', 'sink'))[0]
const bx = 2351 - 600 - Number(bas.width) / 2
chk('top', await sb.from('benchtop_instances').update({ notes: 'Vanity 60 finished: 20mm YDL Bella Oro + 60 mitred apron on the front, 2351 x 500 wall to wall, top 820 AFF (140 basin finishes 960). Basin + spout 600 from the right wall.' }).eq('room_id', R))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(2500)
  await page.evaluate(([id, x]) => window.__canvasApi.updateFixture(id, { x }), [bas.id, bx]); await sleep(1200)
  let st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [c.label, c.dz]); await sleep(1200) }
  st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) console.log(c.label, c.offset, c.dx, c.dy, c.dz)
  for (const f of st.fixtures ?? []) console.log('fixture', f.name, JSON.stringify({ x: f.x, y: f.y, cab: f.cabinet, clash: f.clash }))
  for (const l of ['BC-02', 'BC-03']) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    for (const s of rp.drawer_stacks ?? []) console.log(l, 'box', JSON.stringify({ Y: s.box_Y, h: s.slides?.[0]?.box_height }))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
