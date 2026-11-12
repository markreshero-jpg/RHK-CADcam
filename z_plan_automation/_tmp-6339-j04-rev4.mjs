// RHK6339 J04 rev 4 (Mark 2026-11-12): base cabinets finish inside the 14 timber linings (no fillers).
// Base run 14-2257 (2243): BC-01 580 @14, BC-02 550 @594, BC-03 sink 1141 -> 1113 @1144, KICK 1 @14 x 2243.
// Linings WC-01/02 now floor to shelf top (WALLZ 0, 2214 high) so the bases sit between them;
// benchtop between the linings too (14-2257).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'b2252689-fdc9-4fd7-be9a-f29853f0391e'

// Linings to the floor: WALLZ rule 0.
for (const l of ['WC-01', 'WC-02']) {
  const { data: c } = await sb.from('cabinet_instances').select('id,rule_overrides').eq('room_id', R).eq('label', l).single()
  console.log(l, (await sb.from('cabinet_instances').update({ rule_overrides: { ...c.rule_overrides, WALLZ: 0 } }).eq('id', c.id)).error?.message ?? 'ok')
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const steps = [['BC-03', { offset: 1144, dx: 1113 }], ['BC-02', { offset: 594 }], ['BC-01', { offset: 14 }], ['KICK 1', { offset: 14, dx: 2243 }],
    ['WC-01', { dy: 2214 }], ['WC-02', { dy: 2214 }]]
  for (const [l, u] of steps) { console.log(l, JSON.stringify(await page.evaluate((l, u) => window.__canvasApi.updateCabinet(l, u), l, u))); await sleep(2500) }
  const s = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of s.cabinets) console.log(' ', c.label, 'off', c.offset, 'dx', c.dx, 'dy', c.dy)
  for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) for (const e of [...ci.errors, ...ci.warnings]) console.log('  !', ci.label, e.code, e.message)
} finally { await browser.close() }

// Benchtop between the linings.
const P = [{ x: 14, y: 0 }, { x: 2257, y: 0 }, { x: 2257, y: 700 }, { x: 14, y: 700 }]
const edges = [{ wall: true }, { wall: true }, { wall: false }, { wall: true }]
const segments = P.map((p0, i) => ({ type: 'line', p0, p1: P[(i + 1) % 4], edge: edges[i] }))
const { data: bt } = await sb.from('benchtop_instances').select('id,notes').eq('room_id', R).single()
console.log('top', (await sb.from('benchtop_instances').update({ polygon: P, segments,
  notes: bt.notes.replace('2271 frame to frame x 700', '2243 between the 14 linings x 700') }).eq('id', bt.id)).error?.message ?? 'ok')

// Notes: site note + sink note width.
const { data: ann } = await sb.from('room_annotations').select('id,text,geom').eq('room_id', R)
const site = ann.find(a => a.text?.startsWith('SITE NOTES'))
if (site) console.log('site', (await sb.from('room_annotations').update({ text: site.text
  .replace('14 timber lining both ends BY OTHERS (shown, no CNC).', '14 timber lining both ends BY OTHERS (shown, no CNC),\nfloor to shelf top. Bases + top fit between, no fillers.') }).eq('id', site.id)).error?.message ?? 'ok')
const sink = ann.find(a => a.text?.startsWith('UNDERMOUNT'))
if (sink) console.log('sink', (await sb.from('room_annotations').update({ geom: { ...sink.geom, at: { x: 1174, y: sink.geom.at.y }, width: (1113 - 60) / 20 } }).eq('id', sink.id)).error?.message ?? 'ok')
