// RHK6614 Upstairs Living Storage: read-only shots, plan + Wall 2 elevation.
import puppeteer from 'puppeteer-core'
const R = '65c69db5-2aba-49e0-81c8-95c559968aa2', out = process.argv[2], walls = (process.argv[3] ?? 'Wall 2').split(',').filter(Boolean)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); await page.setViewport({ width: 1500, height: 1500 })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(6000)
  await page.screenshot({ path: `${out}-plan.png` })
  const btn = async t => { const h = await page.evaluateHandle(t => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t), t); await h.asElement()?.click(); await sleep(2500) }
  if (walls.length) { await btn('Elevation'); for (const w of walls) { await btn(w); await page.screenshot({ path: `${out}-${w.replace(' ', '')}.png` }) } }
} finally { await browser.close() }
