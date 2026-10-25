// Item CAD IC1 (z_item_cad): place a BBIN in the test room, open its edit modal, turn
// CAD on, type PULLOUT BIN on the front, move it to the library (bin front), then
// check the room elevation draws it. Screenshots to argv[2]. Prints the new cabinet's
// label so the caller can delete it afterwards.
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? '26f8c90d-f35e-46e3-ae04-10a6cf7e1b48'   // RHK1234 Kitchen Test Room
const sleep = ms => new Promise(r => setTimeout(r, ms))
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('saved', name) }
const clickText = (page, t) => page.evaluate(t => {
  const b = [...document.querySelectorAll('button')].reverse().find(e => e.textContent.trim().startsWith(t) && e.offsetParent !== null)
  b?.click(); return !!b
}, t)

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)) })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
  await sleep(5000)

  const st = await page.evaluate(() => window.__canvasApi.getState())
  const wall = st.walls[0]
  const onWall = st.cabinets.filter(c => c.wall_id === wall.id || c.wall === wall.name)
  const end = Math.max(0, ...onWall.map(c => (c.offset ?? 0) + Number(c.dx)))
  console.log('wall', wall.name, 'length', wall.length, 'cabs on it', onWall.length, 'end', end)
  const existing = process.env.CAB
  const placed = existing ? null : await page.evaluate((w, off) => window.__canvasApi.placeCabinet({ def: 'BBIN', wall: w, offset: off }), wall.id, end + 50)
  console.log('placed', JSON.stringify(placed))
  await sleep(6000)
  const st2 = await page.evaluate(() => window.__canvasApi.getState())
  const cab = st2.cabinets.find(c => (c.wall_id === wall.id || c.wall === wall.name) && Math.abs((c.offset ?? 0) - (end + 50)) < 2)
  const label = existing ?? cab?.label ?? cab?.id
  console.log('cab', JSON.stringify(cab))
  await page.evaluate(l => window.__canvasApi.openCabinet(l), label)
  await sleep(5000)
  await shot(page, 'ic1-1-modal.png')

  console.log('CAD button', await clickText(page, 'CAD'))
  await sleep(1000)
  await shot(page, 'ic1-2-cad-on.png')

  // Text tool, click the middle of the cabinet front (svg = 80 + x, 50 + dy + y).
  console.log('text tool', await page.evaluate(() => { const b = document.querySelector('button[title^="Text"]'); b?.click(); return b?.title }))
  await sleep(300)
  const pt = await page.evaluate(() => {
    const modal = [...document.querySelectorAll('div.fixed.inset-0')].find(d => d.className.includes('z-50'))
    const svgs = [...modal.querySelectorAll('svg[viewBox]')].sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)
    const svg = svgs[0]
    const vb = svg.viewBox.baseVal
    // The cabinet occupies x 80..80+dx, y 50..50+dy of the view; its rect is the first one.
    const r = svg.querySelector('rect')
    const x = Number(r.getAttribute('x')) + Number(r.getAttribute('width')) * 0.3
    const y = Number(r.getAttribute('y')) + Number(r.getAttribute('height')) * 0.45
    const q = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM())
    return { x: q.x, y: q.y, vb: [vb.x, vb.y, vb.width, vb.height] }
  })
  console.log('click at', JSON.stringify(pt))
  await page.mouse.click(pt.x, pt.y); await sleep(700)
  await page.keyboard.type('PULLOUT BIN'); await sleep(300)
  await page.keyboard.down('Control'); await page.keyboard.press('Enter'); await page.keyboard.up('Control')
  await sleep(1500)
  await shot(page, 'ic1-3-typed.png')

  await page.keyboard.press('s'); await sleep(200)
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control')
  await sleep(600)
  const bar = await page.evaluate(() => [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'Item CAD')?.parentElement?.innerText)
  console.log('bar:', bar)
  console.log('move', await clickText(page, 'Bin front (all cabinets)'))
  await sleep(3000)
  console.log('bar after:', await page.evaluate(() => [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'Item CAD')?.parentElement?.innerText))
  await shot(page, 'ic1-4-moved.png')

  // Close CAD + modal, show the room elevation.
  await page.keyboard.press('Escape'); await sleep(300)
  await page.keyboard.press('Escape'); await sleep(300)
  await page.keyboard.press('Escape'); await sleep(1000)
  console.log('elevation tab', await clickText(page, 'Elevation'))
  await sleep(4000)
  const texts = await page.evaluate(() => [...document.querySelectorAll('[data-layer="annotations"] text')].map(t => t.textContent))
  console.log('elevation annotation texts:', JSON.stringify(texts))
  await shot(page, 'ic1-5-elevation.png')
  console.log('LABEL', label)
} finally {
  await browser.close()
}
