// Phone layout + touch gestures (z_mobile/MOBILE-SPEC.md) on an emulated iPhone:
// compact menubar, sidebar drawer, finer lines, one-finger pan, pinch, long-press menu.
// Usage: node z_plan_automation/verify-mobile.mjs <outDir>   (ROOM_ID env optional)
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `mobile-${name}.png`) })

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
try {
  const page = await browser.newPage()
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => { if (!/Failed to fetch/.test(e.message)) console.log('PAGE ERROR:', e.message) })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(5000)

  const cdp = await page.createCDPSession()
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })),
  })
  const view = () => page.evaluate(() => {
    const g = document.querySelector('svg.flex-1 > g')
    return g?.getAttribute('transform') ?? '(none)'
  })

  console.log('phone media:', await page.evaluate(() =>
    matchMedia('(pointer: coarse) and (max-width: 600px), (pointer: coarse) and (max-height: 600px)').matches))
  console.log('menubar compact:', await page.evaluate(() =>
    [...document.querySelectorAll('nav button')].some(b => b.textContent.trim() === 'Menu ▾')))
  await shot(page, '1-layout')

  // Sidebar drawer
  await page.evaluate(() => document.querySelector('button[title="Tools"]')?.click()); await sleep(800)
  await shot(page, '2-drawer')
  await page.evaluate(() => document.querySelector('button[title="Tools"]')?.click()); await sleep(800)

  const svgBox = await page.evaluate(() => {
    const r = document.querySelector('svg.flex-1').getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })
  console.log('canvas box:', svgBox)
  const cx = svgBox.x + svgBox.w / 2, cy = svgBox.y + svgBox.h / 2

  // One-finger pan
  const v0 = await view()
  await touch('touchStart', [[cx, cy]]); await sleep(30)
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[cx + i * 10, cy + i * 6]]); await sleep(16) }
  await touch('touchEnd', []); await sleep(500)
  const v1 = await view()
  console.log('pan:', v0, '→', v1, v0 !== v1 ? 'MOVED' : 'NO CHANGE')

  // Pinch out (zoom in)
  await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]); await sleep(30)
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[cx - 30 - i * 10, cy], [cx + 30 + i * 10, cy]]); await sleep(16) }
  await touch('touchEnd', []); await sleep(500)
  const v2 = await view()
  console.log('pinch:', v1, '→', v2)
  await shot(page, '3-after-pan-pinch')

  // Fit the room again, then long-press on the first cabinet
  await page.evaluate(() => window.__canvasApi?.fitView?.()); await sleep(800)
  const target = await page.evaluate(() => {
    const el = [...document.querySelectorAll('svg.flex-1 polygon, svg.flex-1 rect')]
      .find(e => { const r = e.getBoundingClientRect(); return r.width > 12 && r.height > 12 && r.width < 200 && getComputedStyle(e).pointerEvents !== 'none' && e.closest('g[data-cab-id], g')?.querySelector('text') })
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  console.log('long-press target:', target)
  if (target) {
    await touch('touchStart', [[target.x, target.y]]); await sleep(750)
    const menuOpen = await page.evaluate(() => !!document.querySelector('.fixed.inset-0.z-40'))
    await shot(page, '4-longpress-held')
    await touch('touchEnd', []); await sleep(700)
    const stillOpen = await page.evaluate(() => !!document.querySelector('.fixed.inset-0.z-40'))
    console.log('context menu open while held:', menuOpen, '| after lift:', stillOpen)
    await shot(page, '5-longpress-lifted')
  }
} finally {
  await browser.close()
}
