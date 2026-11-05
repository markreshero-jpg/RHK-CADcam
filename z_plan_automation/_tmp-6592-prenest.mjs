// RHK6592 pre-nest check: re-resolve + persist every cabinet in kitchen + butlers, print issues.
import puppeteer from 'puppeteer-core'
const ROOMS = { Kitchen: 'dc7a22f3-ed0b-4771-a42e-4548fc4de1e1', Butlers: '1c00eb19-09c1-41b8-8c7c-a6441ee0263d' }
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  for (const [n, id] of Object.entries(ROOMS)) {
    await page.goto(`http://localhost:3001/canvas/${id}`, { waitUntil: 'networkidle2', timeout: 90000 })
    await page.waitForFunction('!!window.__canvasApi'); await new Promise(r => setTimeout(r, 1500))
    const iss = await page.evaluate(() => window.__canvasApi.getIssues())
    const st = await page.evaluate(() => window.__canvasApi.getState())
    console.log(n, 'cabinets', iss.length, 'fixtures', JSON.stringify(st.fixtures.map(f => [f.name, f.cabinet, f.clash])))
    for (const x of iss) if (x.errors.length || x.warnings.length) console.log(' ', x.label, JSON.stringify([...x.errors, ...x.warnings].map(e => e.code + ' ' + e.message)))
  }
} finally { await browser.close() }
