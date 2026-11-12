// RHK6339 J07: screenshot WC-02's cabinet modal (3D) to see the LED route marker.
import puppeteer from 'puppeteer-core'
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef', OUT = process.argv[2], LABEL = process.argv[3] ?? 'WC-02'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu', '--window-size=1600,1000'], defaultViewport: { width: 1600, height: 1000 }, protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('console', m => { if (/handOp|hand ops/.test(m.text())) console.log('console', m.text()) })
try {
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  await page.evaluate(l => window.__canvasApi.openCabinet(l), LABEL); await sleep(8000)
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Top')?.click()); await sleep(3000); await page.screenshot({ path: OUT + '-modal.png' })
  const tabs = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => t && t.length < 20))
  console.log(JSON.stringify(tabs))
} finally { await browser.close() }
