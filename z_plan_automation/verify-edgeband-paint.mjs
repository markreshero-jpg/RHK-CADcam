// Edge-banding paint mode (z_edgeband_edit EB2): open BC-01's edit modal in the Test
// Kitchen, 3D, Wire off, press "Edge banding" → every board part shows its edges.
// Optional: BRUSH=toggle|tape|bare picks the brush; CLICKS="x,y;x,y" clicks there
// (SHIFT=1 holds Shift = all four edges); ESC=1 checks Escape leaves the mode.
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'f8e33374-a1fe-4fce-b272-4d4380200367'   // Test Kitchen
const CAB = process.env.CAB ?? 'BC-01'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('saved', name) }
const clickBtn = (page, re) => page.evaluate(src => { const r = new RegExp(src); const b = [...document.querySelectorAll('button')].reverse().find(b => b.offsetParent && r.test(b.textContent.trim())); b?.click(); return !!b }, re.source)

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)) })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
  await sleep(4000)
  console.log(JSON.stringify(await page.evaluate(c => window.__canvasApi.openCabinet(c), CAB)))
  await sleep(4000)
  await clickBtn(page, /^3D$/); await sleep(4000)
  await clickBtn(page, /^Wire$/); await sleep(2500)
  console.log('edge banding button', await clickBtn(page, /^Edge banding$/)); await sleep(2500)
  console.log('bar shown', await page.evaluate(() => !!document.querySelector('[data-eb-paint]')))
  await shot(page, 'ebp-1-paint.png')
  if (process.env.BRUSH) { console.log('brush', await clickBtn(page, { toggle: /^Toggle$/, tape: /^Edge$/, bare: /^No edge$/ }[process.env.BRUSH])); await sleep(500) }
  for (const c of (process.env.CLICKS ?? '').split(';').filter(Boolean)) {
    const [x, y] = c.split(',').map(Number)
    if (process.env.SHIFT) await page.keyboard.down('Shift')
    await page.mouse.click(x, y)
    if (process.env.SHIFT) await page.keyboard.up('Shift')
    await sleep(1500)
  }
  if (process.env.CLICKS) await shot(page, 'ebp-2-painted.png')
  if (process.env.ESC) {
    await page.keyboard.press('Escape'); await sleep(1000)
    console.log('after Esc: bar', await page.evaluate(() => !!document.querySelector('[data-eb-paint]')), 'modal still open', await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.offsetParent && /^Edge banding$/.test(b.textContent.trim()))))
    await shot(page, 'ebp-3-esc.png')
  }
} finally {
  await browser.close()
}
