// RHK6542 Study: re-resolve the open units + desk top, print dividers / cleat, issues.
import puppeteer from 'puppeteer-core'
const R = 'a81555f3-22f3-4efd-947b-4e083bf49c94'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  for (const [l, dz] of [['WC-04', 350], ['TC-07', 335], ['WC-01', 700]]) { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [l, dz]); await sleep(1500) }
  for (const l of ['WC-04', 'TC-07']) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, 'dividers', JSON.stringify(rp.internal_parts.filter(p => p.part_type === 'divider').map(p => [p.X, p.DZ, p.material_id.slice(0, 8)])),
      'shelves X/W', JSON.stringify([...new Set(rp.internal_parts.filter(p => p.part_type === 'fixed_shelf').map(p => `${p.X}/${p.DY}`))]))
  }
  const d = await page.evaluate(() => window.__canvasApi.getResolved('WC-01'))
  console.log('WC-01', JSON.stringify(d.custom_parts.map(p => [p.name, p.X ?? p.x, p.Y ?? p.y, p.DX ?? p.dx, p.DY ?? p.dy, p.DZ ?? p.dz, p.material_id?.slice(0, 8), p.grain_across ?? p.grain_direction])))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  console.log('errors', issues.reduce((n, c) => n + c.errors.length, 0), 'warnings', issues.reduce((n, c) => n + c.warnings.length, 0))
} finally { await browser.close() }
