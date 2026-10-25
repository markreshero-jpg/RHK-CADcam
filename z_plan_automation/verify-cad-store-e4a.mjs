// Shape edit E4a (z_cabinet_shape_edit): the CAD tool now saves through a store
// (default = room_annotations). Check the plan CAD still inserts / updates / deletes
// exactly as before, in the Test Kitchen (no notes of its own).
//   PHASE=a  F7 → Line (2 clicks + Enter), Box (2 clicks), Fillet the box (update),
//            drag the line down 30 px (update). Leaves 2 notes — check the DB.
//   PHASE=b  F7 → Ctrl+A → Delete. Check the DB is empty again.
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const PHASE = process.env.PHASE ?? 'a'
const ROOM = process.env.ROOM_ID ?? 'f8e33374-a1fe-4fce-b272-4d4380200367'   // Test Kitchen
const sleep = ms => new Promise(r => setTimeout(r, ms))
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('saved', name) }

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)) })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
  await sleep(4000)
  await page.mouse.click(1000, 900)          // focus the canvas (empty floor)
  await page.keyboard.press('F7')
  await sleep(800)
  const key = async k => { await page.keyboard.press(k); await sleep(250) }
  const click = async (x, y) => { await page.mouse.move(x, y, { steps: 3 }); await page.mouse.down(); await page.mouse.up(); await sleep(250) }

  if (PHASE === 'a') {
    await key('l'); await click(450, 800); await click(700, 800); await key('Enter')
    await key('r'); await click(800, 760); await click(950, 880)
    await sleep(800)
    await shot(page, 'e4a-1-drawn.png')
    await key('g'); await click(800, 820)        // fillet: click the box → all corners
    await sleep(800)
    await key('s')
    await page.mouse.move(575, 800); await page.mouse.down(); await page.mouse.move(575, 815, { steps: 4 }); await page.mouse.move(575, 830, { steps: 4 }); await page.mouse.up()
    await sleep(1500)
    await shot(page, 'e4a-2-edited.png')
    console.log('state notes', await page.evaluate(() => window.__canvasApi.getState().annotations?.length ?? 'n/a'))
  } else {
    await key('s')
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control')
    await sleep(400)
    await key('Delete')
    await sleep(1500)
    await shot(page, 'e4a-3-deleted.png')
  }
  await page.keyboard.press('Escape'); await page.keyboard.press('F7')
  await sleep(1500)
} finally {
  await browser.close()
}
