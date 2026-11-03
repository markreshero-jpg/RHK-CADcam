// RHK6595 rev 3: WC-02 split — bi-fold cupboard (WC-02, 1000) + 390 PTO wall cabinet over (WC-14). Re-resolve both, report.
import puppeteer from 'puppeteer-core'
const ROOM = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 })
  await sleep(3000)
  const cabs = (await page.evaluate(() => window.__canvasApi.getState())).cabinets
  for (const l of (process.env.CABS ?? 'WC-02,WC-14').split(',')) {
    const c = cabs.find(x => x.label === l)
    console.log(l, 'dims', c?.dx, c?.dy, c?.dz)
    await page.evaluate(([l, dy]) => window.__canvasApi.updateCabinet(l, { dy }), [l, c.dy])
    await sleep(3000)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    for (const z of rp.face_zones) console.log(' zone', z.col_index, 'Y', z.Y, 'DY', z.DY, 'hinge', z.hinge_side, 'role', z.bifold_role ?? '-', 'handle', z.handle?.grip_kind ?? z.handle?.name ?? 'none',
      'holes', (z.bifold_holes ?? []).map(h => `${h.kind}@${h.y}`).join(' '))
    console.log(' hinges', JSON.stringify(rp.hinge_instances.map(h => [h.col_index, h.hinge_edge, h.y_position_mm])))
    console.log(' parts', rp.case_parts.map(p => p.part_key).join(','), '| internal', rp.internal_parts.map(p => p.part_type).join(','))
    console.log(' warnings', JSON.stringify(rp.warnings.map(w => w.code)), 'errors', JSON.stringify(rp.errors.map(e => e.code)))
  }
} finally { await browser.close() }
