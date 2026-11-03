import puppeteer from 'puppeteer-core'
const R = process.argv[2], labels = process.argv.slice(3)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  for (const l of labels) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, 'zones', JSON.stringify(rp.face_zones.map(z => [z.row_index, z.Y, z.DY])))
    for (const s of rp.drawer_stacks ?? []) console.log(l, 'stack', JSON.stringify({ zone: s.zone_key ?? s.row_index, box_Y: s.box_Y, h: s.slides?.[0]?.box_height ?? s.box_height, slide: s.slides?.[0]?.name }))
    console.log(l, 'parts', JSON.stringify(rp.case_parts.filter(p => /rail/.test(p.part_key)).map(p => [p.part_key, p.Y, p.DY, p.DZ])))
    console.log(l, 'keys', Object.keys(rp).join(','))
  }
} finally { await browser.close() }
