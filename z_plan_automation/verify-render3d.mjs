// 3D Colour Render report (trial): open the report headless, wait for the
// off-screen renders, screenshot the preview and save the first picture full size.
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? '0be1888b-8a45-4bb6-ab8a-6febe4483288'   // RHK6581 Laundry J02
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--enable-unsafe-swiftshader'], defaultViewport: { width: 1720, height: 1100 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)) })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(6000)
  const clickText = async (text) => {
    const ok = await page.evaluate(t => { const el = [...document.querySelectorAll('button, div, span, li, a')].reverse().find(e => e.textContent.trim() === t && e.offsetParent !== null); if (el) el.click(); return !!el }, text)
    if (!ok) throw new Error('not found: ' + text)
    await sleep(800)
  }
  await clickText('Reports'); await clickText('Room Reports…')
  const ok = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(e => e.textContent.includes('3D Colour Render'))
    if (b) b.click(); return !!b
  })
  if (!ok) throw new Error('report button not found')
  const t0 = Date.now()
  await page.waitForFunction(() => document.querySelectorAll('img[src^="data:image/jpeg"]').length > 0
    && ![...document.querySelectorAll('button')].some(b => b.textContent.startsWith('Rendering')), { timeout: 120000 })
  console.log('rendered in', Date.now() - t0, 'ms; pictures:', await page.evaluate(() => document.querySelectorAll('img[src^="data:image/jpeg"]').length))
  await sleep(500)
  await page.screenshot({ path: path.join(OUT, 'render3d-report.png') })
  const urls = await page.evaluate(() => [...document.querySelectorAll('img[src^="data:image/jpeg"]')].map(i => i.src))
  urls.forEach((u, i) => fs.writeFileSync(path.join(OUT, `render3d-${i + 1}.jpg`), Buffer.from(u.split(',')[1], 'base64')))
} finally {
  await browser.close()
}
