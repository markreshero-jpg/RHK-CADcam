// Temp: elevation screenshots per wall tab.  node _tmp-6478-elev-walls.mjs <roomId> <outPrefix> <Wall 2> <Wall 4> ...
import puppeteer from 'puppeteer-core'
const [ROOM, OUT, ...WALLS] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1800, height: 1100 } })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 }); await sleep(4000)
  const click = t => page.evaluate(v => [...document.querySelectorAll('button')].find(e => e.textContent.trim() === v && e.offsetParent)?.click(), t)
  await click('Elevation'); await sleep(4000)
  for (const w of WALLS) { await click(w); await sleep(3500); await page.screenshot({ path: `${OUT}-${w.replace(/\s/g, '')}.png` }); console.log('shot', w) }
} finally { await browser.close() }
process.exit(0)
