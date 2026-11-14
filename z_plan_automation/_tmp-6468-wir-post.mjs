// RHK6468 WIR post-draw: half-mm widths back, mirror frame bottom rail (face filler, not a kick), issues.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'dfa682a3-020b-4704-8661-3dbbd6cdf224'
const ok = r => { if (r.error) throw r.error; return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const HALF = [['BC-01', 871.5], ['WC-01', 871.5], ['WC-03', 1569.5], ['BC-04', 1571.5], ['TC-01', 16.5], ['TC-03', 934.5], ['TC-04', 934.5],
  ['WC-06', 1868.5], ['WC-07', 992.5], ['TC-12', 16.5], ['TC-13', 16.5], ['TC-14', 16.5], ['TC-15', 16.5]]
for (const [l, dx] of HALF) ok(await sb.from('cabinet_instances').update({ dx }).eq('room_id', R).eq('label', l))
// Mirror frame bottom: the 32-deep kick can't take spreaders -> a 120 high face filler instead.
ok(await sb.from('cabinet_instances').delete().eq('room_id', R).eq('label', 'BC-11'))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1800, height: 1100 }, protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 }); await sleep(4000)
  const api = async (m, ...a) => { const r = await page.evaluate((m, a) => window.__canvasApi[m](...a), m, a); await sleep(1500); return r }
  const st0 = await page.evaluate(() => window.__canvasApi.getState())
  for (const [l] of HALF) { const c = st0.cabinets.find(x => x.label === l); console.log(l, JSON.stringify(await api('updateCabinet', l, { dy: c.dy }))) }
  if (!st0.cabinets.some(c => c.wall === 'Wall 6' && c.dy === 120)) {
    console.log('place', JSON.stringify(await api('placeCabinet', { def: 'TFKW', wall: 'Wall 6', offset: 0, dx: 1757 })))
    const st = await page.evaluate(() => window.__canvasApi.getState())
    const f = st.cabinets.find(c => c.wall === 'Wall 6' && c.dx === 1757 && c.dy !== 30)
    ok(await sb.from('cabinet_instances').update({ pos_z: 0, notes: 'Mirror frame bottom rail 120 high, 32 proud of the wall (face filler)' }).eq('id', f.id))
    console.log(f.label, JSON.stringify(await api('updateCabinet', f.label, { dy: 120, dz: 14 })))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) console.log(`  ${ci.label} ${e.code}: ${e.message}`)
  console.log('issues done', issues.length)
} finally { await browser.close() }
