import puppeteer from 'puppeteer-core'
const R = 'a81555f3-22f3-4efd-947b-4e083bf49c94'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  const l = process.argv[2] ?? 'BC-02'
  if (process.argv[3]) { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [l, Number(process.argv[3])]); await sleep(2000) }
  const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
  console.log('case', JSON.stringify(rp.case_parts.map(p => [p.part_key, p.X, p.Y, p.Z, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)])))
  console.log('internal', JSON.stringify((rp.internal_parts ?? []).map(p => [p.part_type, p.Y, p.DZ, p.material_id?.slice(0, 8)])))
  console.log('zones', JSON.stringify(rp.face_zones.map(z => [z.face_type, z.Y, z.DY, z.handle?.handle_id ?? null, z.handle?.grip_kind ?? null, z.hinges])))
  console.log('stacks', JSON.stringify((rp.drawer_stacks ?? []).map(s => ({ box_Y: s.box_Y, h: s.box_height, d: s.box_depth ?? s.DZ, slide: s.slide_name ?? s.slide_product_id }))))
  console.log('warn', JSON.stringify([...(rp.warnings ?? []), ...(rp.errors ?? [])].map(w => w.code + ': ' + w.message)))
} finally { await browser.close() }
