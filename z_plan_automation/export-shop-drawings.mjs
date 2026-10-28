// Download a job's Shop Drawings PDFs headlessly through Job Reports.
//   node z_plan_automation/export-shop-drawings.mjs <roomId> <outDir> [--one] [--elev=<set>] [--plan=<set>] [--3d=<set>]
// One PDF per ticked room (all rooms), or with --one a single combined PDF.
// Layer sets by name: a fresh headless profile has none of the remembered report
// picks, so elevations default to "Line Drawing Print" (no carcass internals).
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const [ROOM, OUT_ARG, ...flags] = process.argv.slice(2)
const OUT = path.resolve(OUT_ARG)
const ONE = flags.includes('--one')
const opt = k => flags.find(f => f.startsWith(`--${k}=`))?.slice(k.length + 3)
const SETS = {
  'elevation-print-layer-set': opt('elev') ?? 'Line Drawing Print',
  'plan-view-layer-set': opt('plan'),
  'shop-3d-layer-set': opt('3d'),
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
fs.mkdirSync(OUT, { recursive: true })
const START = Date.now()

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--no-first-run', '--enable-unsafe-swiftshader'], defaultViewport: { width: 1720, height: 1100 }, protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  const cdp = await page.createCDPSession()
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT, eventsEnabled: true })
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message.slice(0, 200)))
  await page.evaluateOnNewDocument((one, sets) => {
    try {
      localStorage.setItem('reports-one-pdf', one ? '1' : '0')
      for (const [k, v] of Object.entries(sets)) if (v) localStorage.setItem(k, v)
    } catch {}
  }, ONE, SETS)
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(5000)
  const clickText = async (text, sel = 'button, div, span, li, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].reverse().find(e => e.textContent.trim() === t && e.offsetParent !== null); if (el) el.click(); return !!el }, text, sel)
    if (!ok) throw new Error('not found: ' + text)
    await sleep(800)
  }
  await clickText('Reports'); await clickText('Room Reports…')
  await clickText('Job Reports', 'button')
  await page.click('[data-tour="report-shop_drawings"]'); await sleep(1500)
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /^Download \d+ rooms?$/.test(b.textContent.trim())), { timeout: 60000 })
  const label = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => /^Download \d+ rooms?$/.test(b.textContent.trim())); b.click(); return b.textContent.trim() })
  console.log(label, ONE ? '(one PDF)' : '(one per room)')
  const want = ONE ? 1 : Number(label.match(/\d+/)[0])
  const t0 = Date.now()
  for (;;) {
    // Count PDFs written this run (a re-run overwrites the same names).
    const done = fs.readdirSync(OUT).filter(f => f.endsWith('.pdf') && fs.statSync(path.join(OUT, f)).mtimeMs >= START - 1000)
    if (done.length >= want) { console.log('saved:', done.join(' | ')); break }
    if (Date.now() - t0 > 600000) { console.log('TIMEOUT, saved so far:', done.join(' | ')); break }
    await sleep(2000)
  }
  await sleep(1500)
} finally { await browser.close() }
