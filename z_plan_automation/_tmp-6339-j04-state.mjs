import puppeteer from 'puppeteer-core'
const R = 'b2252689-fdc9-4fd7-be9a-f29853f0391e'
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await new Promise(r => setTimeout(r, 4000))
  const s = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of s.cabinets) console.log(c.label, c.def ?? c.definition, 'off', c.offset, 'dx', c.dx, 'dy', c.dy, 'dz', c.dz, 'pz', c.pos_z, 'kick', c.kick_run_id ?? '', c.has_toekick)
} finally { await browser.close() }
