// RHK6563 Study: re-resolve after end panel 595, desk open-end tape, wall cleats, back Y fix.
import puppeteer from 'puppeteer-core'
const R = '443a1553-14c4-4b8d-bd1f-2e5890b827e7'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(3000)
  const ups = [['WC-05', { dz: 300 }], ['WC-06', { dz: 300 }]]
  for (const [l, p] of ups) { await page.evaluate((l, p) => window.__canvasApi.updateCabinet(l, p), l, p); await sleep(2500) }
  for (const [l] of ups) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, JSON.stringify(rp.case_parts.map(p => [p.part_key, p.X, p.Y, p.Z, p.DX, p.DY, p.DZ])))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
