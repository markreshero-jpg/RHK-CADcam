import puppeteer from 'puppeteer-core'
const [ROOM, OUT] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000 } })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 }); await sleep(4000)
  await page.evaluate(() => [...document.querySelectorAll('button')].reverse().find(e => e.textContent.trim() === '3D' && e.offsetParent)?.click()); await sleep(9000)
  await page.evaluate(() => [...document.querySelectorAll('button')].find(e => e.textContent.includes('Reset view'))?.click()); await sleep(3000)
  await page.screenshot({ path: OUT + '/a.png' })
  // zoom toward the corner and look up from below
  await page.mouse.move(800, 330); for (let i = 0; i < 6; i++) { await page.mouse.wheel({ deltaY: -250 }); await sleep(250) }
  await page.mouse.move(800, 500); await page.mouse.down(); await page.mouse.move(800, 650, { steps: 10 }); await page.mouse.up(); await sleep(2000)
  await page.screenshot({ path: OUT + '/b.png' })
} finally { await browser.close() }
