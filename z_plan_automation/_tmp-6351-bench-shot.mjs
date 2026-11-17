// RHK6351 Bench Seat: read-only screenshots - plan, then the elevations of Walls 2/3/4.
import puppeteer from 'puppeteer-core'
const R = 'e1ef206e-138d-45cc-953d-a1a0c21f2a02', out = process.argv[2], walls = (process.argv[3] ?? 'Wall 2,Wall 3,Wall 4').split(',').filter(Boolean)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); await page.setViewport({ width: 2600, height: 1300 })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(6000)
  await page.screenshot({ path: `${out}-plan.png` })
  const btn = async t => { const h = await page.evaluateHandle(t => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t), t); await h.asElement()?.click(); await sleep(2500) }
  if (walls.length) { await btn('Elevation'); for (const w of walls) { await btn(w); await page.screenshot({ path: `${out}-${w.replace(' ', '')}.png` }) } }
} finally { await browser.close() }
