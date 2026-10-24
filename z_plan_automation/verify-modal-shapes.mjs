// Cabinet edit modal true shapes: open each named cabinet's edit modal headless and
// screenshot its Top / Elevation / Side views (default: the test room's shaped ones).
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
const LABELS = (process.env.LABELS ?? 'BC-04,BC-08').split(',')
const VIEWS = ['Top', 'Elevation', 'Side']
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1100, deviceScaleFactor: 1 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(6000)
  for (const label of LABELS) {
    await page.evaluate(l => window.__canvasApi.openCabinet(l), label)
    await sleep(4000)
    for (const v of VIEWS) {
      const ok = await page.evaluate(t => { const b = [...document.querySelectorAll('button')].reverse().find(e => e.textContent.trim() === t && e.offsetParent !== null); b?.click(); return !!b }, v)
      if (!ok) { console.log('no tab', v); continue }
      await sleep(1500)
      const paths = await page.evaluate(() => document.querySelectorAll('svg path[data-part-id]').length)
      await page.screenshot({ path: path.join(OUT, `modal-${label}-${v}.png`) })
      console.log('saved', label, v, 'true-shape paths:', paths)
    }
    await page.keyboard.press('Escape'); await sleep(1500)
  }
} finally {
  await browser.close()
}
