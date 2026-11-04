// RHK6478 Kitchen: plan + elevation screenshots.  node _tmp-6478-kshot.mjs outDir [tag]
import puppeteer from 'puppeteer-core'
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6', OUT = process.argv[2], TAG = process.argv[3] ?? 'k'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000, defaultViewport: { width: 1800, height: 1100 } })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(7000)
  await page.screenshot({ path: `${OUT}/${TAG}_plan.png` })
  const click = t => page.evaluate(v => { const b = [...document.querySelectorAll('button')].filter(e => e.textContent.trim() === v && e.offsetParent); b.at(-1)?.click(); return b.length }, t)
  await click('Elevation'); await sleep(5000)
  for (const w of (process.argv[4] ?? 'Wall 5').split(',')) { await click(w); await sleep(4000); await page.screenshot({ path: `${OUT}/${TAG}_${w.replace(' ', '')}.png` }) }
} finally { await browser.close() }
