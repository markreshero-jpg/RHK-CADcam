// Shape edit E3 (z_cabinet_shape_edit): plan Edit shape on a plain base cabinet in
// the Test Kitchen. Opens the edit, screenshots the overlay, picks the left edge,
// sets it to Finished gable (write-through — checks the left side's board changed),
// picks a corner, then Cancels (the footprint must go back to none — check in the
// DB afterwards). A second pass opens and closes with no change. Screenshots to argv[2].
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'f8e33374-a1fe-4fce-b272-4d4380200367'   // Test Kitchen
const CAB = process.env.CAB ?? '99b01fba-c073-40c6-b9e2-4ad2112bc13f'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('saved', name) }
const clickText = (page, t) => page.evaluate(t => {
  const b = [...document.querySelectorAll('button, label')].reverse().find(e => e.textContent.trim().startsWith(t) && e.offsetParent !== null)
  b?.click(); return !!b
}, t)
// Real mouse click on the middle of an overlay element's hit path.
async function clickOverlay(page, sel) {
  const pt = await page.evaluate(sel => {
    const g = document.querySelector(sel)
    if (!g) return null
    const el = g.querySelector('path:last-of-type') ?? g.querySelector('circle')
    if (el.tagName === 'circle') { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }
    const len = el.getTotalLength(), q = el.getPointAtLength(len / 2)
    const s = new DOMPoint(q.x, q.y).matrixTransform(el.getScreenCTM())
    return { x: s.x, y: s.y }
  }, sel)
  if (!pt) return false
  await page.mouse.click(pt.x, pt.y)
  return true
}
const panelText = page => page.evaluate(() => [...document.querySelectorAll('p')].find(p => p.textContent.startsWith('Edit shape —'))?.closest('div.w-72')?.innerText ?? null)
const leftSide = page => page.evaluate(id => window.__canvasApi.getResolved(id).then(r => {
  const p = r?.case_parts?.find(p => p.part_key === 'left_side')
  return p ? { material_id: p.material_id, DZ: p.DZ, tape: p.edge_band?.id } : null
}), CAB)

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)) })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
  await sleep(5000)

  const before = await leftSide(page)
  console.log('left side before', JSON.stringify(before))
  console.log('editShape', JSON.stringify(await page.evaluate(id => window.__canvasApi.editShape(id), CAB)))
  await sleep(1500)
  console.log('overlay edges', await page.evaluate(() => [...document.querySelectorAll('[data-edge]')].map(g => g.getAttribute('data-edge')).join(',')))
  console.log('overlay corners', await page.evaluate(() => [...document.querySelectorAll('[data-corner]')].map(g => g.getAttribute('data-corner')).join(',')))
  await shot(page, 'e3-1-open.png')

  console.log('click left edge', await clickOverlay(page, '[data-edge="left"]'))
  await sleep(600)
  console.log('panel after edge pick:\n' + (await panelText(page))?.split('\n').slice(0, 14).join(' | '))
  await shot(page, 'e3-2-edge.png')

  console.log('Finished gable', await clickText(page, 'Finished gable'))
  await sleep(5000)
  const after = await leftSide(page)
  console.log('left side after finished', JSON.stringify(after), 'changed:', JSON.stringify(after) !== JSON.stringify(before))
  await shot(page, 'e3-3-finished.png')

  const corner = await page.evaluate(() => document.querySelector('[data-corner]')?.getAttribute('data-corner'))
  console.log('click corner', corner, await clickOverlay(page, `[data-corner="${corner}"]`))
  await sleep(600)
  console.log('panel after corner pick:\n' + (await panelText(page))?.split('\n').slice(0, 12).join(' | '))
  await shot(page, 'e3-4-corner.png')

  console.log('Cancel', await clickText(page, 'Cancel'))
  await sleep(5000)
  console.log('mode after cancel: overlay present =', await page.evaluate(() => !!document.querySelector('[data-shape-edit]')))
  const restored = await leftSide(page)
  console.log('left side after cancel', JSON.stringify(restored), 'restored:', JSON.stringify(restored) === JSON.stringify(before))

  // Open + Done with no change: nothing written.
  await page.evaluate(id => window.__canvasApi.editShape(id), CAB)
  await sleep(800)
  await page.keyboard.press('Escape')
  await sleep(1500)
  console.log('after Esc: overlay present =', await page.evaluate(() => !!document.querySelector('[data-shape-edit]')))
  await shot(page, 'e3-5-done.png')
} finally {
  await browser.close()
}
