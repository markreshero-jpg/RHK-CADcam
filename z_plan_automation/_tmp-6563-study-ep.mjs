// RHK6563 Study: inspect BEPF + Wall 3 desk top (WUP) parts / tape.
import puppeteer from 'puppeteer-core'
const R = '443a1553-14c4-4b8d-bd1f-2e5890b827e7'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  const upd = process.argv[2] ? JSON.parse(process.argv[2]) : null
  if (upd) { await page.evaluate(u => window.__canvasApi.updateCabinet(u.label, u.patch), upd); await sleep(2500) }
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets.filter(c => c.wall === 'Wall 3' && (c.dx === 18 || c.dx === 1431))) {
    console.log(c.label, c.def ?? '', c.offset, c.dx, c.dy, c.dz)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), c.label)
    console.log(JSON.stringify({case: rp.case_parts, custom: rp.custom_parts}).slice(0, 2500))
  }
} finally { await browser.close() }
