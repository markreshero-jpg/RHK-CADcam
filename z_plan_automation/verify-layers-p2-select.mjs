// Room 3D selection check: hover + left-click several cabinets (with doors,
// drawers, overheads) and report what the status bar says was selected; then
// right-click opens the cabinet menu. Screenshot of the last selection.
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
// Default points match the default 3D camera for the Mark Johnson kitchen.
const POINTS = (process.env.POINTS ?? '830,640;830,195;1110,750;1080,480;1300,260;930,300')
  .split(';').map(p => p.split(',').map(Number))
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1720, height: 950 },
})
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(5000)
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '3D')?.click())
  await sleep(15000)
  const statusText = () => page.evaluate(() =>
    [...document.querySelectorAll('span, div')].map(e => e.textContent ?? '')
      .find(t => /^(base|tall|wall)[\w ]* · [^·]+ · \d+×\d+×\d+$/.test(t.trim()))?.trim() ?? '(nothing selected)')
  for (const [x, y] of POINTS) {
    await page.keyboard.press('Escape'); await sleep(2500)
    await page.mouse.move(x - 20, y - 10); await sleep(150)
    await page.mouse.move(x, y, { steps: 5 }); await sleep(250)
    await page.mouse.down(); await sleep(60); await page.mouse.up()
    await sleep(900)
    console.log(`click ${x},${y} →`, await statusText())
  }
  await page.screenshot({ path: path.join(OUT, 'p2-3d-selected.png') })
  const [lx, ly] = POINTS[POINTS.length - 1]
  await page.mouse.click(lx, ly, { button: 'right' })
  await sleep(1000)
  console.log('right-click cabinet menu:', await page.evaluate(() => [...document.querySelectorAll('button')].some(el => el.textContent.trim() === 'Edit cabinet')))
} finally { await browser.close() }
