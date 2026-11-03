import puppeteer from 'puppeteer-core'
const R = 'a81555f3-22f3-4efd-947b-4e083bf49c94'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  for (const l of ['TC-06', 'TC-07', 'TC-09', 'TC-10']) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, 'kick', rp.toekick_height ?? rp.kick_height, 'case', JSON.stringify(rp.case_parts.filter(p => /bottom|top|kick/.test(p.part_key)).map(p => [p.part_key, p.X, p.Y, p.DY, p.DZ])))
    console.log('  internal', JSON.stringify((rp.internal_parts ?? []).map(p => [p.part_type, p.X, p.Y, p.DX, p.DY, p.DZ])))
  }
} finally { await browser.close() }
