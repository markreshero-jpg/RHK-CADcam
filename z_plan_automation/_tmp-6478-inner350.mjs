import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  for (const R of ['6e8f14c4-1325-4f07-b312-a6f9386d0245', 'fbca7078-ae65-4e87-baf8-7bfe6ba55dda']) {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
    for (const l of ['BC-01', 'BC-02']) { await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dz: 476.5 }), l); await sleep(1500) }
    await sleep(1000)
    for (const l of ['BC-01', 'BC-02']) {
      const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
      const s = rp.internal_slides[0]
      console.log(R.slice(0, 8), l, 'runner', s.nominal_length, 'x', s.box_height, 'Z', s.Z, 'front holes', JSON.stringify(s.drills.filter(d => d.surface === 'drawer_front').map(d => d.y)),
        'box', JSON.stringify(rp.internal_parts.filter(p => p.part_type !== 'inner_drawer_front').map(p => [p.part_type, p.DX, p.DY])))
    }
    const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
    for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
    console.log(R.slice(0, 8), 'issues', n)
    await page.close()
  }
} finally { await browser.close() }
