import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto('http://localhost:3001/canvas/6e8f14c4-1325-4f07-b312-a6f9386d0245', { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  for (const l of ['TC-01', 'TC-02', 'TC-03', 'TC-04']) { await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dz: 476.5 }), l); await sleep(1000) }
  await sleep(1500)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) console.log(c.label, c.offset, c.dx, c.dy, c.dz)
  for (const l of ['TC-01', 'TC-02', 'TC-03', 'TC-04']) { const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l); const p = rp.custom_parts[0]; console.log(l, p.dx, p.dy, p.dz) }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
