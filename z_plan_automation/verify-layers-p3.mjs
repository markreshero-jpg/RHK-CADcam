// Display layers Phase 3a: per-item colour + weight and per-view background.
// Needs a set (env COLOUR_SET, default 'ZZ colours test') with overrides.
// Screenshots plan / elevation / 3D + the Layer Manager to argv[2].
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
const SET = process.env.COLOUR_SET ?? 'ZZ colours test'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1720, height: 950 },
})
const shot = async (page, n) => { await page.screenshot({ path: path.join(OUT, n) }); console.log('shot', n) }
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => { if (!/Failed to fetch/.test(e.message)) console.log('PAGE ERROR:', e.message) })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(6000)
  const layerSelect = async () => { for (const h of await page.$$('select')) if (await h.evaluate(el => [...el.options].some(o => o.value === '__manage__'))) return h }
  const sel = await layerSelect()
  await sel.select(await sel.evaluate((el, n) => [...el.options].find(o => o.text === n)?.value, SET))
  await sleep(2000)
  const btn = async l => { await page.evaluate(x => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === x).pop()?.click(), l); await sleep(2500) }

  console.log('plan svg background:', await page.evaluate(() => document.querySelector('svg.select-none')?.style.background))
  console.log('plan gable stroke/width:', await page.evaluate(() => {
    const p = document.querySelector('polygon[data-part="left_side"]'); return p ? [p.getAttribute('stroke'), p.getAttribute('stroke-width')] : null
  }))
  await shot(page, 'p3-plan.png')
  await btn('Elevation'); await btn('Wall 2')
  await shot(page, 'p3-elev.png')
  await btn('3D'); await sleep(12000)
  await shot(page, 'p3-3d.png')
  await btn('Plan')
  await (await layerSelect()).select('__manage__'); await sleep(1500)
  await shot(page, 'p3-manager.png')
} finally { await browser.close() }
