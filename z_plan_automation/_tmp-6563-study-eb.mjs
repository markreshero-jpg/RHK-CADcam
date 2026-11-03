import puppeteer from 'puppeteer-core'
const R = '443a1553-14c4-4b8d-bd1f-2e5890b827e7'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  for (const l of ['BC-03', 'BC-04', 'WC-03', 'WC-04', 'BC-01']) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, JSON.stringify([...rp.case_parts.map(p => [p.part_key, p.edge_band?.id?.slice(0, 8), p.edge_band?.top, p.edge_band?.bottom, p.edge_band?.left, p.edge_band?.right]), ...rp.custom_parts.map(p => [p.name, p.edge_band?.id?.slice(0, 8) ?? p.edgeband_id?.slice(0,8), p.edge_top, p.edge_bottom])]))
  }
} finally { await browser.close() }
