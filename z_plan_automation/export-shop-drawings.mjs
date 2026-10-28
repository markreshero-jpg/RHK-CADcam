// Download a job's Shop Drawings PDFs headlessly through Job Reports.
//   node z_plan_automation/export-shop-drawings.mjs <roomId> <outDir> [--one] [--set "<layer set name>"]
// One PDF per ticked room (all rooms), or with --one a single combined PDF.
// Layer set for the plan, elevations and 3D: "Line Drawing Print" unless --set (Mark, 2026-10-28).
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'

const argv = process.argv.slice(2)
const [ROOM, OUT_ARG] = argv
const OUT = path.resolve(OUT_ARG)
const ONE = argv.includes('--one')
const SET_NAME = argv.includes('--set') ? argv[argv.indexOf('--set') + 1] : 'Line Drawing Print'
const sleep = ms => new Promise(r => setTimeout(r, ms))
fs.mkdirSync(OUT, { recursive: true })
const START = Date.now()

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: sets } = await sb.from('drawing_layer_sets').select('id,name')
const SET = sets?.find(x => x.name.toLowerCase() === SET_NAME.toLowerCase())
if (!SET) { console.log('layer set not found:', SET_NAME, '— have:', (sets ?? []).map(x => x.name).join(', ')); process.exit(1) }

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--no-first-run', '--enable-unsafe-swiftshader'], defaultViewport: { width: 1720, height: 1100 }, protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  const cdp = await page.createCDPSession()
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT, eventsEnabled: true })
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message.slice(0, 200)))
  // The report pickers remember their set per report in localStorage (ReportLayerSetPicker).
  await page.evaluateOnNewDocument((one, setId) => {
    try {
      localStorage.setItem('reports-one-pdf', one ? '1' : '0')
      for (const k of ['plan-view-layer-set', 'elevation-print-layer-set', 'shop-3d-layer-set']) localStorage.setItem(k, setId)
    } catch {}
  }, ONE, SET.id)
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
  const shown = await page.evaluate(() => [...document.querySelectorAll('select[data-report-layer-set]')].map(s => s.selectedOptions[0]?.textContent))
  console.log('report layer sets (plan | elevations | 3D):', shown.join(' | '))
  if (shown.some(n => n !== SET.name)) throw new Error(`a report section is not on "${SET.name}"`)
  const label = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => /^Download \d+ rooms?$/.test(b.textContent.trim())); b.click(); return b.textContent.trim() })
  console.log(label, ONE ? '(one PDF)' : '(one per room)')
  const want = ONE ? 1 : Number(label.match(/\d+/)[0])
  for (;;) {
    // Count PDFs written this run (a re-run overwrites the same names).
    const done = fs.readdirSync(OUT).filter(f => f.endsWith('.pdf') && fs.statSync(path.join(OUT, f)).mtimeMs >= START - 1000)
    if (done.length >= want) { console.log('saved:', done.join(' | ')); break }
    if (Date.now() - START > 600000) { console.log('TIMEOUT, saved so far:', done.join(' | ')); break }
    await sleep(2000)
  }
  await sleep(1500)
} finally { await browser.close() }
