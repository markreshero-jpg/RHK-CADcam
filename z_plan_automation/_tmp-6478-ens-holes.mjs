import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto('http://localhost:3001/canvas/6e8f14c4-1325-4f07-b312-a6f9386d0245', { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('BC-01'))
  const fmt = sl => ({ side: sl.side, Y: sl.Y, Z: sl.Z, box: sl.box_height, front: sl.drills.filter(d => d.surface === 'drawer_front').map(d => [d.x, d.y, d.z]) })
  console.log('MAIN zone', JSON.stringify(rp.face_zones.map(z => [z.Y, z.DY])))
  for (const s of rp.drawer_stacks) console.log('MAIN', JSON.stringify({ box_Y: s.box_Y, slides: s.slides.map(fmt) }))
  console.log('INNER front', JSON.stringify(rp.internal_parts.filter(p => p.part_type === 'inner_drawer_front').map(p => [p.X, p.Y, p.Z, p.DX, p.DY])))
  console.log('INNER box', JSON.stringify(rp.internal_parts.filter(p => p.part_type !== 'inner_drawer_front').map(p => [p.part_type, p.Y, p.DX])))
  for (const sl of rp.internal_slides) console.log('INNER', JSON.stringify(fmt(sl)))
} finally { await browser.close() }
