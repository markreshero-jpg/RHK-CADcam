import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${process.argv[2]}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), process.argv[3])
  for (const p of rp.case_parts) console.log(JSON.stringify({ k: p.part_key, X: p.X, Y: p.Y, Z: p.Z, DX: p.DX, DY: p.DY, DZ: p.DZ }))
  for (const p of rp.internal_parts ?? []) console.log('int', JSON.stringify({ k: p.part_key, Y: p.Y, DZ: p.DZ }))
} finally { await browser.close() }
