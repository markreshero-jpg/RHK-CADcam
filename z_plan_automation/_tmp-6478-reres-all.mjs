// Re-resolve EVERY cabinet in the given rooms via a no-op {dz} (never {dy}). args: roomId ...
// Used after a library change (e.g. new matched edge tape) so saved parts pick it up.
import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  for (const roomId of process.argv.slice(2)) {
    const page = await browser.newPage()
    page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
    await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    await page.goto(`http://localhost:3001/canvas/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(4000)
    const st = await page.evaluate(() => window.__canvasApi.getState())
    let ok = 0, fail = 0
    for (const c of st.cabinets) {
      try { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [c.id ?? c.label, c.dz]); ok++ } catch (e) { fail++; console.log('  FAIL', c.label, e.message.split('\n')[0]) }
      await sleep(600)
    }
    const issues = await page.evaluate(() => window.__canvasApi.getIssues())
    const errs = issues.reduce((n, c) => n + c.errors.length, 0)
    console.log(`ROOM ${st.room?.name ?? roomId}: ${ok} resolved, ${fail} failed, ${errs} errors`)
    for (const c of issues) for (const e of c.errors) console.log(`  ${c.label} ${e.code}: ${e.message}`)
    await page.close()
  }
} finally { await browser.close() }
process.exit(0)
