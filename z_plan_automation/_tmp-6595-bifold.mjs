// RHK6595 WC-02 → bi-fold (left, no bottom guide): re-resolve that one cabinet, report.
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
  const c = (await page.evaluate(() => window.__canvasApi.getState())).cabinets.find(x => x.label === 'WC-02')
  console.log('WC-02', c.dx, c.dy, c.dz)
  await page.evaluate(dy => window.__canvasApi.updateCabinet('WC-02', { dy }), c.dy)
  await sleep(3000)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('WC-02'))
  console.log('bifold', JSON.stringify(rp.bifold))
  for (const z of rp.face_zones) console.log('zone', z.row_index, z.col_index, z.face_type, 'Y', z.Y, 'DY', z.DY, 'hinge', z.hinge_side, 'role', z.bifold_role ?? '-', 'handle', z.handle ? 'yes' : 'none',
    'holes', JSON.stringify((z.bifold_holes ?? []).map(h => `${h.kind}@${Math.round(h.x * 10) / 10},${Math.round(h.y * 10) / 10}`)))
  console.log('hinges', JSON.stringify(rp.hinge_instances.map(h => [h.row_index, h.col_index, h.hinge_edge, h.y_position_mm])))
  console.log('warnings', JSON.stringify(rp.warnings.map(w => w.code)), 'errors', JSON.stringify(rp.errors.map(e => e.code)))
  const shelf = rp.internal_parts.filter(p => p.part_type === 'fixed_shelf').map(p => [p.Y, p.DZ])
  console.log('fixed shelves', JSON.stringify(shelf))
} finally { await browser.close() }
