import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto('http://localhost:3001/canvas/6e8f14c4-1325-4f07-b312-a6f9386d0245', { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  for (const l of ['TC-01', 'TC-04']) { const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l); console.log(l, JSON.stringify(rp.custom_parts).slice(0, 900)) }
} finally { await browser.close() }
