import puppeteer from 'puppeteer-core'
const R = 'b2252689-fdc9-4fd7-be9a-f29853f0391e'
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 400)))
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 400)) })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }).then(() => console.log('api ok')).catch(() => console.log('no api'))
  console.log((await page.evaluate(() => document.body.innerText)).slice(0, 600))
} finally { await browser.close() }
