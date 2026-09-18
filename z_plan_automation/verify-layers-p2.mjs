// Display layers Phase 2 verification: hardware items + room 3D via CabinetScene.
// Needs a set named by env HW_SET (default 'ZZ hardware test') with 3D hardware
// shown. Screenshots to argv[2] directory.
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
const HW_SET = process.env.HW_SET ?? 'ZZ hardware test'
const PORT = process.env.DEV_PORT ?? '3001'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1720, height: 950 },
})
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('shot', name) }
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) console.log('CONSOLE ERROR:', m.text().slice(0, 300)) })
  await page.goto(`http://localhost:${PORT}/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(6000)

  const layerSelect = async () => {
    for (const h of await page.$$('select')) {
      if (await h.evaluate(el => [...el.options].some(o => o.value === '__manage__'))) return h
    }
    throw new Error('layer select not found')
  }
  const chooseSet = async name => {
    const sel = await layerSelect()
    const value = await sel.evaluate((el, n) => [...el.options].find(o => o.text === n)?.value, name)
    if (!value) throw new Error('no set ' + name)
    await sel.select(value)
    await sleep(1500)
  }
  const clickButton = async label => {
    await page.evaluate(l => [...document.querySelectorAll('button')].filter(x => x.textContent.trim() === l).pop()?.click(), label)
    await sleep(1500)
  }
  const partCounts = () => page.evaluate(() => {
    const c = {}
    for (const p of document.querySelectorAll('polygon[data-part]')) c[p.dataset.part] = (c[p.dataset.part] ?? 0) + 1
    return c
  })

  await chooseSet('Full parts')
  console.log('plan full parts:', JSON.stringify(await partCounts()))
  await chooseSet(HW_SET)
  console.log('plan hw set:', JSON.stringify(await partCounts()))
  await shot(page, 'p2-plan-hw.png')

  await chooseSet('Full parts')
  await clickButton('3D'); await sleep(15000)
  await shot(page, 'p2-3d-full.png')
  await chooseSet(HW_SET); await sleep(15000)
  await shot(page, 'p2-3d-hw.png')

  await chooseSet('Full parts')
  await clickButton('Elevation'); await clickButton('Wall 2'); await sleep(2000)
  await shot(page, 'p2-elev-full.png')
} finally { await browser.close() }
