// probe BC-01 drawer geometry (+ optional internal_grid / face_grid tweaks via env)
import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
  await page.goto('http://localhost:3001/canvas/6e8f14c4-1325-4f07-b312-a6f9386d0245', { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  for (const l of (process.env.RES ?? '').split(',').filter(Boolean)) { await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dz: 476.5 }), l); await sleep(1500) }
  for (const l of ['BC-01', 'BC-02']) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log('case', JSON.stringify(rp.case_parts.map(p => [p.part_key, 'Y', p.Y, 'Z', p.Z, p.DX, p.DY, p.DZ])))
    console.log('zones', JSON.stringify(rp.face_zones.map(z => ({ t: z.face_type, Y: z.Y, DY: z.DY, X: z.X, DX: z.DX }))))
    const strip = o => JSON.stringify(o, (k, v) => (k === 'box_parts' || k === 'parts' || k === 'holes' || k === 'drill' || k === 'outline') ? `[${v?.length}]` : v).slice(0, 2500)
    console.log('stacks', strip(rp.drawer_stacks))
    console.log('internal', strip(rp.internal_parts ?? rp.internal ?? null))
    console.log('keys', Object.keys(rp).join(','))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) console.log(`  ${ci.label} ${e.code}: ${e.message}`)
} finally { await browser.close() }
