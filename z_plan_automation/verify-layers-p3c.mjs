// Display layers Phase 3c: print reports follow a layer set + chains measure only
// drawn cabinets. Creates a temporary "carcase + kicks only" set (dims on), then:
//  - canvas plan: wall-cabinet chain disappears (wall cabinets draw nothing), base chain stays
//  - Plan View report: Full parts vs temp set — part / label / chain counts
//  - Elevation Views report: same
// Screenshots each, then deletes the set.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
const TEMP = 'ZZ p3c test'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const hide = ['carcass_outline', 'carcass_gables', 'carcass_top', 'carcass_bottom', 'carcass_back', 'doors', 'drawer_fronts',
  'false_panels', 'door_swings', 'drawer_lines', 'door_chevrons', 'drawer_labels', 'shelves', 'dividers', 'inner_drawers',
  'accessories', 'shelf_labels', 'inner_drawer_labels', 'drawer_boxes', 'drawer_runners', 'inner_drawer_runners', 'hinges',
  'machining', 'applied_panels', 'fillers', 'custom_panels', 'benchtops', 'internal_outline']
const items = { ...Object.fromEntries(hide.map(id => [id, { visible: false }])), kick_faces: { visible: true, style: 'dashed' }, kick_spreaders: { visible: true } }
await sb.from('drawing_layer_sets').delete().eq('name', TEMP)
const { error: insErr } = await sb.from('drawing_layer_sets').insert({ name: TEMP, sort_order: 99, settings: { plan: { items }, elevation: { items } } })
if (insErr) throw insErr

let browser
try {
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1720, height: 1100 } })
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(6000)
  const canvasSelect = async () => { for (const h of await page.$$('select')) if (await h.evaluate(el => [...el.options].some(o => o.value === '__manage__'))) return h }
  const pickCanvas = async name => { const s = await canvasSelect(); await s.select(await s.evaluate((el, n) => [...el.options].find(o => o.text === n)?.value, name)); await sleep(2000) }
  // Plan canvas chain labels: text inside the dimension chain groups — count numeric texts.
  const numericTexts = sel => page.evaluate(s => [...document.querySelectorAll(s)].filter(t => /^\d+$/.test(t.textContent.trim())).length, sel)

  await pickCanvas('Full parts')
  const canvasFull = await numericTexts('svg text')
  await pickCanvas(TEMP)
  const canvasTemp = await numericTexts('svg text')
  console.log('canvas plan numeric labels — Full parts:', canvasFull, ' temp:', canvasTemp)
  await page.screenshot({ path: path.join(OUT, 'p3c-canvas-plan.png') })
  await pickCanvas('Full parts')

  const clickText = async (text, sel = 'button, div, span, a') => {
    const ok = await page.evaluate((t, s) => {
      const el = [...document.querySelectorAll(s)].find(e => e.textContent.trim().replace(/^✓/, '') === t && e.offsetParent !== null)
      if (el) { el.click(); return true } return false
    }, text, sel)
    if (!ok) throw new Error('not found: ' + text)
    await sleep(800)
  }
  await page.evaluate(() => window.__canvasApi?.openReportModal?.('room'))
  await sleep(500)
  if (!(await page.evaluate(() => document.body.innerText.includes('Plan View')))) {
    await clickText('Reports', 'button'); await clickText('Room Reports…', 'button')
  }
  const reportSelect = () => page.$('select[data-report-layer-set]')
  const pickReport = async name => { const s = await reportSelect(); await s.select(await s.evaluate((el, n) => [...el.options].find(o => o.text === n)?.value, name)); await sleep(1500) }
  const reportStats = () => page.evaluate(() => [...document.querySelectorAll('svg[data-vb-w]')].map(svg => ({
    polygons: svg.querySelectorAll('polygon').length,
    rects: svg.querySelectorAll('rect').length,
    dashed: svg.querySelectorAll('[stroke-dasharray]').length,
    numbers: [...svg.querySelectorAll('text')].filter(t => /^\d+$/.test(t.textContent.trim())).length,
    labels: [...svg.querySelectorAll('text')].filter(t => /^[A-Z]{2}-\d/.test(t.textContent.trim())).length,
  })))

  await clickText('Plan View', 'button, div')
  await page.waitForSelector('select[data-report-layer-set]', { timeout: 20000 })
  console.log('plan report default set:', await (await reportSelect()).evaluate(el => el.options[el.selectedIndex].text))
  await pickReport('Full parts')
  console.log('plan report Full parts:', JSON.stringify(await reportStats()))
  await page.screenshot({ path: path.join(OUT, 'p3c-plan-full.png') })
  await pickReport(TEMP)
  console.log('plan report temp:', JSON.stringify(await reportStats()))
  await page.screenshot({ path: path.join(OUT, 'p3c-plan-temp.png') })

  await clickText('Elevation Views', 'button, div')
  await page.waitForSelector('select[data-report-layer-set]', { timeout: 20000 })
  await pickReport('Full parts')
  console.log('elevation report Full parts:', JSON.stringify((await reportStats()).slice(0, 2)))
  await (await page.$$('svg[data-vb-w]'))[1]?.screenshot({ path: path.join(OUT, 'p3c-elev-full.png') })
  await pickReport(TEMP)
  console.log('elevation report temp:', JSON.stringify((await reportStats()).slice(0, 2)))
  await (await page.$$('svg[data-vb-w]'))[1]?.screenshot({ path: path.join(OUT, 'p3c-elev-temp.png') })
} finally {
  await browser?.close()
  await sb.from('drawing_layer_sets').delete().eq('name', TEMP)
}
