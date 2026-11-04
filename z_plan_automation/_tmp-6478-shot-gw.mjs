import puppeteer from 'puppeteer-core'
const OUT = process.argv[2]
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000, defaultViewport: { width: 1800, height: 1100 } })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  for (const [n, R] of [['guest', '19f84132-6ed5-49b5-a0da-0f916966dcbb'], ['wip', 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae']]) {
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(6000)
    await page.screenshot({ path: `${OUT}/${n}_plan.png` })
  }
} finally { await browser.close() }
