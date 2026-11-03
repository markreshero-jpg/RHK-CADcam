import puppeteer from 'puppeteer-core'
const R = 'a81555f3-22f3-4efd-947b-4e083bf49c94'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets.filter(c => c.wall === 'Wall 1')) console.log(c.label, c.def ?? '', c.offset, c.dx, c.dy, c.dz, c.pos_z ?? '')
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('WC-08'))
  console.log('case', JSON.stringify(rp.case_parts.map(p => [p.part_key, p.X, p.Y, p.Z, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)])))
  console.log('custom', JSON.stringify(rp.custom_parts))
} finally { await browser.close() }
