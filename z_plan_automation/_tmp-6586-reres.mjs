// Re-resolve listed cabinets via a no-op {dz} (never {dy} — lifts kick-run members). args: roomId:BC-01,BC-02 ...
import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  for (const arg of process.argv.slice(2)) {
    const [roomId, list] = arg.split(':'), labels = list.split(',')
    const page = await browser.newPage()
    page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
    await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    await page.goto(`http://localhost:3001/canvas/${roomId}`, { waitUntil: 'networkidle2', timeout: 120000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 90000 }); await sleep(2500)
    const st = await page.evaluate(() => window.__canvasApi.getState())
    console.log('ROOM', st.room?.name ?? roomId)
    for (const c of st.cabinets.filter(c => labels.includes(c.label))) {
      try { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [c.id ?? c.label, c.dz]); console.log('  resolved', c.label, c.dy, c.dz) } catch (e) { console.log('  FAIL', c.label, e.message.split('\n')[0]) }
      await sleep(800)
    }
    const issues = await page.evaluate(() => window.__canvasApi.getIssues())
    for (const c of issues) for (const e of [...c.errors, ...c.warnings]) console.log(`  ${c.label} ${e.code}: ${e.message}`)
    await page.close()
  }
} finally { await browser.close() }
