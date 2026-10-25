// Edge banding on the selected part (z_edgeband_edit EB1): open BC-01's edit modal in
// the Test Kitchen, go to 3D, click the middle of the cabinet (a front / panel) and
// screenshot: the picked part's four edges should show — taped cyan, bare grey.
// Then click near where an edge band shows to toggle (CLICK=x,y env, optional).
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'f8e33374-a1fe-4fce-b272-4d4380200367'   // Test Kitchen
const CAB = process.env.CAB ?? 'BC-01'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('saved', name) }

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
  const tabs = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent && /^3D$/i.test(b.textContent.trim())).length)
  console.log('3D tabs', tabs)
  await page.evaluate(() => [...document.querySelectorAll('button')].reverse().find(b => b.offsetParent && /^3D$/i.test(b.textContent.trim()))?.click())
  await sleep(4000)
  if (process.env.NOWIRE) { await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.offsetParent && b.textContent.trim() === 'Wire')?.click()); await sleep(2500) }
  const box = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('canvas')].filter(c => c.offsetParent).sort((a, b) => b.width * b.height - a.width * a.height)
    const r = cs[0]?.getBoundingClientRect()
    return r && { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  console.log('canvas', JSON.stringify(box))
  await shot(page, 'eb-1-3d.png')
  const px = Number(process.env.PX ?? 0.5), py = Number(process.env.PY ?? 0.5)
  await page.mouse.click(box.x + box.w * px, box.y + box.h * py, { button: process.env.LEFT ? 'left' : 'right' })
  await sleep(1500)
  await shot(page, 'eb-2-selected.png')
  if (process.env.CLICK) {
    const [x, y] = process.env.CLICK.split(',').map(Number)
    // (the part menu stays open beside it — Escape would close the whole modal)
    await page.mouse.click(x, y); await sleep(800)    // first click closes the part menu
    await page.mouse.click(x, y); await sleep(2000)
    console.log('panel ticks', await page.evaluate(() => [...document.querySelectorAll('input[type=checkbox]')].map(i => [i, (i.closest('label') ?? i.parentElement)?.textContent?.trim() ?? '']).filter(([i, t]) => i.offsetParent && /^(Top|Bot|Left|Right)$/.test(t)).map(([i, t]) => t + '=' + i.checked).join(' ')))
    await shot(page, 'eb-3-toggled.png')
  }
} finally {
  await browser.close()
}
