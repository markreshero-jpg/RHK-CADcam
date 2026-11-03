// Temp: plan screenshot zoomed at a screen point.  node _tmp-6586-planzoom.mjs <roomId> <x> <y> <clicks> <out.png>
import puppeteer from 'puppeteer-core'
const [ROOM, X, Y, N, OUT] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000 } })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 }); await sleep(5000)
  await page.mouse.move(+X, +Y); for (let i = 0; i < +N; i++) { await page.mouse.wheel({ deltaY: -200 }); await sleep(200) }
  await sleep(2000); await page.screenshot({ path: OUT })
} finally { await browser.close() }
