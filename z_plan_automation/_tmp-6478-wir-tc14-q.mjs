import puppeteer from 'puppeteer-core'
const R = 'e58340a6-4b68-4543-a1ca-a686b515a647'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(6000)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('TC-14'))
  console.log(Object.keys(rp).join(' '))
  for (const [k, v] of Object.entries(rp)) if (/joint|drill|op/i.test(k) && Array.isArray(v)) {
    console.log(k, v.length)
    const near = v.filter(o => JSON.stringify(o).match(/divider|2236|2220|2537|2554/))
    for (const o of near.slice(0, 30)) console.log('  ', JSON.stringify(o).slice(0, 260))
  }
} finally { await browser.close() }
