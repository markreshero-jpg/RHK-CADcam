// RHK6563 Study WC-05: back split across the width (Tas Oak 1493 wide > sheet across grain), re-resolve.
import puppeteer from 'puppeteer-core'
const R = '443a1553-14c4-4b8d-bd1f-2e5890b827e7'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  await page.evaluate(() => window.__canvasApi.updateCabinet('WC-05', { dz: 300 })); await sleep(4000)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('WC-05'))
  console.log(JSON.stringify(rp.case_parts.filter(p => /back/.test(p.part_key)).map(p => [p.part_key, p.X, p.DX, p.DY, p.edge_band])))
  console.log('issues', JSON.stringify(await page.evaluate(() => window.__canvasApi.getIssues?.('WC-05'))).slice(0, 400))
} finally { await browser.close() }
