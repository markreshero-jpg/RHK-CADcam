// RHK6595: BC-13 back to 689 (layout + page 4); the draw left it 672.5, a 17 gap to the waterfall. Via the canvas API + resolve.
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
  for (const l of (process.env.CABS ?? '').split(',').filter(Boolean)) {
    const c = cabs.find(x => x.label === l)
    if (!c) { console.log(l, 'NOT FOUND'); continue }
    console.log(l, 'dims before', c.dx, c.dy, c.dz)
    await page.evaluate(([l, dy]) => window.__canvasApi.updateCabinet(l, { dx: 689 }), [l, c.dy])
    await sleep(3000)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    if (!rp) { console.log(' no resolved result'); continue }
    for (const z of rp.face_zones ?? []) console.log(' zone r', z.row_index, 'c', z.col_index, z.face_type ?? '', 'Y', z.Y, 'DY', z.DY, 'DX', z.DX, 'handle', z.handle?.name ?? z.handle?.grip_kind ?? 'none')
    console.log(' parts', (rp.case_parts ?? []).length, 'case /', (rp.internal_parts ?? []).length, 'internal')
    console.log(' warnings', JSON.stringify((rp.warnings ?? []).map(w => [w.code, w.message])))
    console.log(' errors', JSON.stringify((rp.errors ?? []).map(e => [e.code, e.message])))
  }
} finally { await browser.close() }
