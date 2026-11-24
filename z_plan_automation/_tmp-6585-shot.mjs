// RHK6585: read-only screenshots - plan, then the named walls' elevations.  node _tmp-6585-shot.mjs <roomId> <outPrefix> "Wall 1,Wall 2"
import puppeteer from 'puppeteer-core'
const R = process.argv[2], out = process.argv[3], walls = (process.argv[4] ?? '').split(',').filter(Boolean)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); await page.setViewport({ width: 2200, height: 1200 })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(6000)
  await page.screenshot({ path: `${out}-plan.png` })
  const btn = async t => { const h = await page.evaluateHandle(t => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t), t); const e = h.asElement(); if (!e) console.log('no button', t); await e?.click(); await sleep(2500) }
  if (walls.length) { await btn('Elevation'); for (const w of walls) { await btn(w); await page.screenshot({ path: `${out}-${w.replace(' ', '')}.png` }) } }
} finally { await browser.close() }
