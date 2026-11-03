// RHK6542 Study Wall 2 robe: tops 2420 -> 2400 (TC-01/04 panels 2400, TC-02/03 2320 on the kick), WC-06 bulkhead 140 (Mark 2026-11-03).
// dy set in the DB first (kicked members: updateCabinet dy lifts pos_z); this re-resolves with no-op dz.
import puppeteer from 'puppeteer-core'
const R = 'a81555f3-22f3-4efd-947b-4e083bf49c94'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  const dz = process.argv[2] === 'panels' ? { 'TC-01': 581.5, 'TC-04': 581.5 } : { 'TC-01': 581.5, 'TC-02': 520, 'TC-03': 520, 'TC-04': 581.5, 'WC-06': 582 }
  for (const [l, d] of Object.entries(dz)) { await page.evaluate((l, d) => window.__canvasApi.updateCabinet(l, { dz: d }), l, d); await sleep(2500) }
  for (const l of Object.keys(dz)) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    const z = (rp.face_zones ?? []).map(z => [z.face_type, z.Y, z.DY])
    const ip = (rp.internal_parts ?? []).filter(p => !/accessory|rail_support/.test(p.part_type)).map(p => [p.part_type, p.Y, p.DY])
    console.log(l, 'case', JSON.stringify(rp.case_parts.map(p => [p.part_key, p.Y, p.DX, p.DY])).slice(0, 300), '\n  fronts', JSON.stringify(z), '\n  int', JSON.stringify(ip).slice(0, 400))
  }
  const iss = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const i of iss) if (i.errors.length || i.warnings.length) console.log('ISSUE', i.label, JSON.stringify(i.errors), JSON.stringify(i.warnings).slice(0, 300))
} finally { await browser.close() }
