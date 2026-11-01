// Hardware Pick List / Takeoff print (Job Reports): rooms run on down the page, each
// kept whole; "Page per room" puts each on its own page. Captures the print HTML,
// prints it to A4 PDFs in <outDir> and lists the room names on each page.
//   node z_plan_automation/verify-room-packing.mjs <roomId> <outDir> [hardware_pick|takeoff]
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import puppeteer from 'puppeteer-core'

const [ROOM, OUT_ARG, REPORT = 'hardware_pick'] = process.argv.slice(2)
const OUT = path.resolve(OUT_ARG)
const sleep = ms => new Promise(r => setTimeout(r, ms))
fs.mkdirSync(OUT, { recursive: true })
const py = [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs/Python/Python312/python.exe')].find(p => p && fs.existsSync(p)) ?? 'python'

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1720, height: 1100 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message.slice(0, 200)))
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
  await sleep(4000)
  const clickText = async (t, sel = 'button, div, span, li, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].reverse().find(e => e.textContent.trim() === t && e.offsetParent !== null); if (el) el.click(); return !!el }, t, sel)
    if (!ok) throw new Error('not found: ' + t)
    await sleep(800)
  }
  await clickText('Reports'); await clickText('Room Reports…')
  await clickText('Job Reports', 'button')
  await page.click(`[data-tour="report-${REPORT}"]`)
  await sleep(8000)   // takeoff data (resolve + nests) loads
  // Catch the print window's HTML instead of opening it.
  await page.evaluate(() => {
    window.__printHtml = ''
    window.open = () => ({ document: { write: h => { window.__printHtml += h }, close() {} }, focus() {}, print() {} })
  })
  for (const pp of [false, true]) {
    await page.evaluate(want => { const c = document.querySelector('[data-page-per-room] input'); if (c && c.checked !== want) c.click() }, pp)
    await sleep(300)
    await page.evaluate(() => { window.__printHtml = '' })
    await clickText('Print / PDF', 'button')
    const html = await page.evaluate(() => window.__printHtml)
    const p2 = await browser.newPage()
    await p2.setContent(html, { waitUntil: 'load' })
    const file = path.join(OUT, `${REPORT}-${pp ? 'page-per-room' : 'packed'}.pdf`)
    await p2.pdf({ path: file, format: 'A4', preferCSSPageSize: true, printBackground: true })
    await p2.close()
    const rooms = await page.evaluate(h => [...new DOMParser().parseFromString(h, 'text/html').querySelectorAll('.band .name')].map(e => e.textContent), html)
    const pages = JSON.parse(execFileSync(py, ['-I', '-c', 'import sys,json,pymupdf;print(json.dumps([p.get_text() for p in pymupdf.open(sys.argv[1])]))', file], { encoding: 'utf8' }))
    console.log(`\n${pp ? 'PAGE PER ROOM' : 'PACKED'}: ${pages.length} pages, ${rooms.length} room blocks`)
    pages.forEach((t, i) => console.log(`  page ${i + 1}: ${rooms.filter(r => t.includes(r)).join(' | ') || '(continued)'}`))
    // A room is split if its band is on one page and its sign-off / next band isn't reached before the page ends:
    // flag pages that start with table rows (no band at the top).
    pages.forEach((t, i) => { if (i > 0 && !rooms.some(r => t.trimStart().startsWith(r))) console.log(`  ! page ${i + 1} does not start with a room heading`) })
  }
} finally { await browser.close() }
