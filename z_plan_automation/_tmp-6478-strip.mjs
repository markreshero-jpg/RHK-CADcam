// Re-resolve given cabinets in a room and print their custom parts. node _tmp-6478-strip.mjs <roomId> <label,label> [plan.png]
import puppeteer from 'puppeteer-core'
const [R, labels, shot] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], defaultViewport: { width: 1600, height: 1000 }, protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  for (const l of labels.split(',')) { await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dz: 476.5 }), l); await sleep(1500) }
  for (const l of labels.split(',')) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, JSON.stringify(rp.custom_parts.map(p => ({ dx: p.dx, dy: p.dy, dz: p.dz, x: p.x, y: p.y, z: p.z, X: p.X, Y: p.Y, Z: p.Z }))))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
  if (shot) { await page.reload({ waitUntil: 'networkidle2' }); await sleep(5000); await page.screenshot({ path: shot }) }
} finally { await browser.close() }
