// RHK6478 Buffet rev 4 (Mark 2026-11-17, pre-nest):
//  1. fillers = board thickness: uppers WC-01 / WC-04 16.5 Teak (was 30), bottom BC-04 18 2pac (was 30).
//     BC-03 + WC-03 kept the same width (1033); WC-02 open unit takes the left (1279, mirrors 1213).
//     Upper run 16.5 | 1279 | 1033 | 16.5 = 2345, so WC-03 sits 1.5 right of BC-03 (1295.5 vs 1294).
//  2. below bench 595 overall incl doors: BC-01/02/03/04/07 + KICK 1 dz 580 -> 575 (panels = cab.d + t.door + 2).
//     Benchtop polygon stays 600. Apron notch on the panels re-cut at 578 (17 deep, was 22) as revision 2.
//  3. edging: BC-01/02/07 front long edge only; BC-04 no wall edge; WC-01 / WC-04 only the long edge at the cabinets.
// No deletes. Run once: node z_plan_automation/_tmp-6478-buf-rev4.mjs go
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) { console.log('ERR', t, r.error.message); process.exit(1) } return r.data }
const R = '0df13af4-8a6f-438f-a10d-6a9b4754aa97'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,dx,dz,pos_x').eq('room_id', R))
const by = l => cabs.find(c => c.label === l)
if (by('BC-04').dx !== 30 || by('BC-03').dz !== 580) { console.log('already run?', by('BC-04').dx, by('BC-03').dz); process.exit(1) }
if (process.argv[2] !== 'go') { console.log('dry run - pass go'); process.exit(0) }

// 3. edging (side customs: right = front; front customs: left / right = the ends)
const E = (t, b, l, r) => ({ edge_top: t, edge_bottom: b, edge_left: l, edge_right: r })
const edges = { 'BC-01': E(false, false, false, true), 'BC-02': E(false, false, false, true), 'BC-07': E(false, false, false, true),
  'BC-04': E(true, true, true, false), 'WC-01': E(false, false, false, true), 'WC-04': E(false, false, true, false) }
for (const [l, v] of Object.entries(edges)) {
  const n = chk(l, await sb.from('cabinet_custom_parts').update(v).eq('cabinet_instance_id', by(l).id).select('id'))
  console.log(l, 'edges', JSON.stringify(v), n.length)
}

// 2b. apron notch re-cut on the 595 panels (new revision, old one kept)
const D = 595, NOTCH = 578
const pts = [[0, 0], [NOTCH, 0], [NOTCH, 40], [D, 40], [D, 880], [0, 880]]
const segments = pts.map((p, i) => ({ p0: { x: p[0], y: p[1] }, p1: { x: pts[(i + 1) % 6][0], y: pts[(i + 1) % 6][1] }, type: 'line' }))
for (const l of ['BC-01', 'BC-02', 'BC-07']) {
  const so = chk('so', await sb.from('part_shape_overrides').select('*').eq('cabinet_id', by(l).id).order('revision', { ascending: false }).limit(1))[0]
  const { id, created_at, ...s } = so
  chk('so ins', await sb.from('part_shape_overrides').insert({ ...s, revision: so.revision + 1, segments,
    meta: { ...s.meta, bounds: { minX: 0, minY: 0, maxX: D, maxY: 880 }, baseAtSave: { h: 880, w: D } } }))
  console.log(l, 'notch rev', so.revision + 1)
}

// notes + mirror callouts
const notes = {
  'BC-03': '3 equal drawers, 2pac sharknose. 595 overall incl fronts (Mark 2026-11-17)',
  'BC-04': '18 filler to Wall 3 (Mark 2026-11-17, was 30), no tape on the wall edge',
  'WC-01': '16.5 Sublime Teak upper filler to Wall 1 (Mark 2026-11-17, was 30), tape on the cabinet edge only',
  'WC-04': '16.5 Sublime Teak upper filler to Wall 3 (Mark 2026-11-17, was 30), tape on the cabinet edge only',
}
for (const [l, n] of Object.entries(notes)) chk(l, await sb.from('cabinet_instances').update({ notes: n }).eq('id', by(l).id))
const anns = chk('ann', await sb.from('room_annotations').select('id,text').eq('room_id', R).like('text', '%MIRROR 1198%'))
for (const a of anns) { chk('ann', await sb.from('room_annotations').update({ text: a.text.replace('MIRROR 1198', 'MIRROR 1213') }).eq('id', a.id)); console.log('ann', a.text.split('\n')[0]) }

// 1 + 2 through the canvas (re-resolves)
const ups = [
  ['BC-07', { dz: 575 }], ['BC-01', { dz: 575 }], ['BC-02', { dz: 575 }],
  ['BC-03', { dx: 1033, dz: 575 }], ['BC-04', { offset: 2327, dx: 18, dz: 575 }], ['KICK 1', { dz: 575 }],
  ['WC-01', { dx: 16.5 }], ['WC-02', { offset: 16.5, dx: 1279 }], ['WC-03', { offset: 1295.5, dx: 1033 }], ['WC-04', { offset: 2328.5, dx: 16.5 }],
]
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(4000)
  for (const [l, v] of ups) { console.log(l, JSON.stringify(v), JSON.stringify(await page.evaluate(([i, x]) => window.__canvasApi.updateCabinet(i, x), [by(l).id, v])).slice(0, 120)); await sleep(1500) }
  // re-resolve the rest (custom part edges / notch picked up)
  for (const l of ['BC-05', 'BC-06', 'WC-05']) { await page.evaluate(([i, dz]) => window.__canvasApi.updateCabinet(i, { dz }), [by(l).id, by(l).dz]); await sleep(800) }
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets.sort((a, b) => a.label.localeCompare(b.label))) console.log(' ', c.label, c.offset ?? c.pos_x, c.dx, c.dz)
  const iss = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const c of iss) for (const e of [...c.errors, ...c.warnings]) console.log('ISSUE', c.label, e.code, e.message)
} finally { await browser.close() }
process.exit(0)
