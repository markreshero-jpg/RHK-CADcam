// Job Reports › Hardware Pick List → PDF (headless). Catches the Print / PDF popup and prints it to a file.
// node z_plan_automation/export-pick-list.mjs <roomId> <out.pdf> [--report hardware_pick|takeoff] [--only "<Room>" ...]
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
const [ROOM, OUT] = process.argv.slice(2)
const REPORT = process.argv.includes('--report') ? process.argv[process.argv.indexOf('--report') + 1] : 'hardware_pick'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1720, height: 1100 }, protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message.slice(0, 200)))
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 }); await sleep(5000)
  const clickText = async (text, sel = 'button, div, span, li, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].reverse().find(e => e.textContent.trim() === t && e.offsetParent !== null); if (el) el.click(); return !!el }, text, sel)
    if (!ok) throw new Error('not found: ' + text); await sleep(800)
  }
  await clickText('Reports'); await clickText('Room Reports…'); await clickText('Job Reports', 'button')
  await page.click(`[data-tour="report-${REPORT}"]`); await sleep(15000)   // takeoff loads + resolves every room
  // --only "<Room>" (repeatable): the pick list's own room ticks — None, then tick each room (Mark 2026-11-23:
  // pick list for just the rooms optimised).
  const ONLY = process.argv.flatMap((a, i) => a === '--only' ? [process.argv[i + 1]] : [])
  if (ONLY.length) {
    await clickText('None', 'button')
    for (const n of ONLY) await clickText(`☐ ${n}`, 'button')
    await sleep(5000)
  }
  const popup = new Promise(res => browser.once('targetcreated', async t => res(await t.page())))
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Print / PDF'); if (!b) throw new Error('no Print / PDF'); b.click() })
  const pop = await popup
  await pop.evaluateOnNewDocument(() => { window.print = () => {} }); await pop.evaluate(() => { window.print = () => {} }).catch(() => {})
  await sleep(3000)
  console.log('popup text:', (await pop.evaluate(() => document.body.innerText)).slice(0, 1500))
  await pop.pdf({ path: OUT, format: 'A4', printBackground: true, margin: { top: '15mm', bottom: '20mm', left: '15mm', right: '15mm' } })
  console.log('saved', OUT, fs.statSync(OUT).size)
} finally { await browser.close() }
