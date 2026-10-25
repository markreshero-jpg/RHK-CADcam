// Item CAD IC2 (z_item_cad): {bin} field, Hide here / Show here, Detach — on an existing
// BBIN in the test room (CAB, default BC-09). Cleans up after itself (own notes deleted,
// library emptied, hidden list cleared). Screenshots to argv[2].
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? '26f8c90d-f35e-46e3-ae04-10a6cf7e1b48'   // RHK1234 Kitchen Test Room
const CAB = process.env.CAB ?? 'BC-09'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('saved', name) }
const clickText = (page, t) => page.evaluate(t => {
  const b = [...document.querySelectorAll('button')].reverse().find(e => e.textContent.trim().startsWith(t) && e.offsetParent !== null)
  b?.click(); return !!b
}, t)
const bar = page => page.evaluate(() => [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'Item CAD')?.parentElement?.innerText.replace(/\n/g, ' | '))
const elevTexts = page => page.evaluate(() => [...document.querySelectorAll('[data-layer="annotations"] text')].map(t => t.textContent))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)) })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
  await sleep(5000)
  console.log('elevation tab', await clickText(page, 'Elevation')); await sleep(2500)

  const open = async () => { await page.evaluate(l => window.__canvasApi.openCabinet(l), CAB); await sleep(4000) }
  const close = async () => { for (let i = 0; i < 4; i++) { await page.keyboard.press('Escape'); await sleep(300) } await sleep(1500) }

  // 1. Draw PULLOUT BIN / {bin} and move it to the bin front.
  await open()
  await clickText(page, 'CAD'); await sleep(800)
  await page.evaluate(() => document.querySelector('[data-tour="cad-text"]')?.click()); await sleep(300)
  const pt = await page.evaluate(() => {
    const modal = [...document.querySelectorAll('div.fixed.inset-0')].find(d => d.className.includes('z-50'))
    const svg = [...modal.querySelectorAll('svg[viewBox]')].sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0]
    const r = svg.querySelector('rect')
    const q = new DOMPoint(Number(r.getAttribute('x')) + Number(r.getAttribute('width')) * 0.25, Number(r.getAttribute('y')) + Number(r.getAttribute('height')) * 0.45).matrixTransform(svg.getScreenCTM())
    return { x: q.x, y: q.y }
  })
  await page.mouse.click(pt.x, pt.y); await sleep(700)
  await page.keyboard.type('PULLOUT BIN'); await page.keyboard.press('Enter'); await page.keyboard.type('{bin}')
  await page.keyboard.down('Control'); await page.keyboard.press('Enter'); await page.keyboard.up('Control'); await sleep(1200)
  const fieldsList = await page.evaluate(() => document.body.innerText.toLowerCase().includes('this cabinet') && document.body.innerText.includes('{bin}'))
  console.log('panel lists item fields:', fieldsList)
  await shot(page, 'ic2-1-typed.png')
  await page.keyboard.press('s'); await sleep(200)
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control'); await sleep(500)
  console.log('move', await clickText(page, 'Bin front (all cabinets)')); await sleep(3000)
  console.log('bar:', await bar(page))
  await close()
  console.log('A elevation (expect PULLOUT BIN + bin name):', JSON.stringify(await elevTexts(page)))
  await shot(page, 'ic2-2-elevation.png')

  // 2. Hide here.
  await open()
  console.log('hide', await clickText(page, 'Hide here')); await sleep(1500)
  console.log('bar:', await bar(page))
  await shot(page, 'ic2-3-hidden-modal.png')
  await close()
  console.log('B elevation (expect none):', JSON.stringify(await elevTexts(page)))

  // 3. Show here, then Detach.
  await open()
  console.log('show', await clickText(page, 'Show here')); await sleep(1000)
  console.log('detach', await clickText(page, 'Detach')); await sleep(3000)
  console.log('bar:', await bar(page))
  await close()
  console.log('C elevation (expect own copy, once):', JSON.stringify(await elevTexts(page)))

  // 4. Clean up: delete own notes, show the library again, empty it.
  await open()
  await clickText(page, 'CAD'); await sleep(600)
  await page.keyboard.press('s'); await sleep(200)
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control'); await sleep(300)
  await page.keyboard.press('Delete'); await sleep(1500)
  console.log('show', await clickText(page, 'Show here')); await sleep(1000)
  console.log('remove', await clickText(page, 'Remove')); await sleep(300)
  console.log('confirm', await clickText(page, 'Remove from library?')); await sleep(2500)
  console.log('bar:', await bar(page))
  await close()
  console.log('D elevation (expect none):', JSON.stringify(await elevTexts(page)))
} finally {
  await browser.close()
}
