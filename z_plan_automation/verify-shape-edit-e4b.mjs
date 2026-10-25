// Shape edit E4b (z_cabinet_shape_edit): CAD tools on a cabinet outline, Test Kitchen
// BC-01 (plain). Select the outline, drag the right side out (box grows), drag the
// left side out (box grows + the cabinet moves), fillet the front-left corner (a 5th
// edge), Delete (refused), Ctrl+Z, then Cancel → everything back (check the DB:
// footprint null, dx / pos as before). Screenshots to argv[2].
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'f8e33374-a1fe-4fce-b272-4d4380200367'   // Test Kitchen
const CAB = process.env.CAB ?? '99b01fba-c073-40c6-b9e2-4ad2112bc13f'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('saved', name) }
// Screen point at fraction t along an overlay edge.
const edgePt = (page, id, t = 0.5) => page.evaluate((id, t) => {
  const el = document.querySelector(`[data-edge="${id}"] path:last-of-type`)
  if (!el) return null
  const q = el.getPointAtLength(el.getTotalLength() * t)
  const s = new DOMPoint(q.x, q.y).matrixTransform(el.getScreenCTM())
  return { x: s.x, y: s.y }
}, id, t)
const cab = page => page.evaluate(id => { const c = window.__canvasApi.getState().cabinets.find(c => c.id === id); return c && { dx: Number(c.dx), dz: Number(c.dz), offset: c.offset } }, CAB)
const panel = page => page.evaluate(() => [...document.querySelectorAll('p')].find(p => p.textContent.startsWith('Edit shape —'))?.closest('div.w-72')?.innerText ?? '')
async function drag(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + dx * i / 8, from.y + dy * i / 8)
  await page.mouse.up(); await sleep(2500)
}

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)) })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
  await sleep(4000)
  const before = await cab(page)
  console.log('before', JSON.stringify(before))
  await page.evaluate(id => window.__canvasApi.editShape(id), CAB)
  await sleep(1500)

  // Select the outline (click the front edge) — grips appear.
  const f = await edgePt(page, 'front', 0.3)
  await page.mouse.click(f.x, f.y); await sleep(600)
  console.log('picked:', (await panel(page)).match(/Edge: \w+/)?.[0])
  await shot(page, 'e4b-1-selected.png')

  // Drag the right side out 40 px.
  await drag(page, await edgePt(page, 'right', 0.5), 40, 0)
  const r1 = await cab(page)
  console.log('after right drag', JSON.stringify(r1), 'grew:', r1.dx > before.dx + 50)
  await shot(page, 'e4b-2-right.png')

  // Drag the left side out 40 px (the cabinet moves left by what it grows).
  await page.mouse.click((await edgePt(page, 'front', 0.5)).x, (await edgePt(page, 'front', 0.5)).y); await sleep(400)
  await drag(page, await edgePt(page, 'left', 0.5), -40, 0)
  const r2 = await cab(page)
  console.log('after left drag', JSON.stringify(r2), 'grew:', r2.dx > r1.dx + 50, 'moved left:', r2.offset < r1.offset - 50)

  // Fillet the front-left corner: G, then click the front side and the left side near it.
  await page.keyboard.press('g'); await sleep(300)
  await page.mouse.click((await edgePt(page, 'front', 0.92)).x, (await edgePt(page, 'front', 0.92)).y); await sleep(300)
  await page.mouse.click((await edgePt(page, 'left', 0.1)).x, (await edgePt(page, 'left', 0.1)).y); await sleep(2500)
  const edges = await page.evaluate(() => [...document.querySelectorAll('[data-edge]')].map(g => g.getAttribute('data-edge')))
  console.log('edges after fillet', edges.length, edges.join(','))
  await shot(page, 'e4b-3-fillet.png')

  // Delete the outline: refused.
  await page.keyboard.press('s'); await sleep(200)
  await page.mouse.click((await edgePt(page, 'back', 0.5)).x, (await edgePt(page, 'back', 0.5)).y); await sleep(300)
  await page.keyboard.press('Delete'); await sleep(800)
  console.log('panel msg:', (await panel(page)).split('\n').find(l => /outline/i.test(l) && /cabinet needs/i.test(l)) ?? '(none)')
  console.log('edges still', await page.evaluate(() => document.querySelectorAll('[data-edge]').length))

  // Ctrl+Z steps back the fillet.
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control'); await sleep(2500)
  console.log('edges after undo', await page.evaluate(() => document.querySelectorAll('[data-edge]').length))
  await shot(page, 'e4b-4-undo.png')

  // Cancel: all back.
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Cancel' && b.offsetParent)?.click())
  await sleep(4000)
  const after = await cab(page)
  console.log('after cancel', JSON.stringify(after), 'restored:', JSON.stringify(after) === JSON.stringify(before))
  await shot(page, 'e4b-5-cancel.png')
} finally {
  await browser.close()
}
