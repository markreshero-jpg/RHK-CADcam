// Cabinet sheets true shapes: open Room Reports → Cabinet Sheets headless and
// screenshot the sheets of the named cabinets (default: the test room's shaped ones).
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
const LABELS = (process.env.LABELS ?? 'BC-04,BC-08').split(',')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1200, deviceScaleFactor: 3 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(6000)
  const clickText = async text => {
    const ok = await page.evaluate(t => { const el = [...document.querySelectorAll('button, div, span, li, a')].reverse().find(e => e.textContent.trim() === t && e.offsetParent !== null); if (el) el.click(); return !!el }, text)
    if (!ok) throw new Error('not found: ' + text)
    await sleep(800)
  }
  await clickText('Reports'); await clickText('Room Reports…')
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Cabinet Sheets'))?.click())
  await page.waitForFunction(() => [...document.querySelectorAll('svg')].some(s => [...s.querySelectorAll('text')].some(t => t.textContent === 'PLAN')), { timeout: 60000 })
  await sleep(3000)
  for (const label of LABELS) {
    const h = await page.evaluateHandle(l => [...document.querySelectorAll('svg')].find(s => s.querySelector('text')?.textContent === l), label)
    const el = h.asElement()
    if (!el) { console.log('no sheet for', label); continue }
    await el.scrollIntoView()
    await sleep(300)
    await el.screenshot({ path: path.join(OUT, `sheet-${label}.png`) })
    console.log('saved', label)
  }
} finally {
  await browser.close()
}
