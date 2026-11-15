// Temp: plan screenshots of several rooms.  node _tmp-6478-n13-shots.mjs <outDir> <roomId:name>...
import puppeteer from 'puppeteer-core'
const [OUT, ...ROOMS] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 2000, height: 1300 } })
try {
  for (const rr of ROOMS) {
    const [id, name] = rr.split(':')
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    await page.goto(`http://localhost:3001/canvas/${id}`, { waitUntil: 'networkidle2', timeout: 180000 })
    await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 }); await sleep(5000)
    await page.screenshot({ path: `${OUT}/${name}_plan.png` }); console.log('shot', name)
    await page.close()
  }
} finally { await browser.close() }
process.exit(0)
