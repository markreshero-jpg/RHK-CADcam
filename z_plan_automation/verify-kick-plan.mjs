// Kick assemblies in plan behave like cabinets: name + size labels, click selects,
// move crosshair + stretch markers when selected. Needs a kicks set with labels on
// (env KICK_SET, default 'ZZ kicks + labels'). Screenshot to argv[2].
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
const KICK_SET = process.env.KICK_SET ?? 'ZZ kicks + labels'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--no-first-run'], defaultViewport: { width: 1720, height: 950 },
})
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(6000)
  for (const h of await page.$$('select')) {
    const v = await h.evaluate((el, n) => [...el.options].some(o => o.value === '__manage__') ? [...el.options].find(o => o.text === n)?.value : null, KICK_SET)
    if (v) { await h.select(v); break }
  }
  await sleep(2000)
  const texts = await page.evaluate(() => [...document.querySelectorAll('svg text')].map(t => t.textContent.trim()).filter(t => /^KICK|^\d+×\d+$/.test(t)))
  console.log('plan texts (KICK labels + sizes):', JSON.stringify(texts))

  // Click the KICK 1 label position (its kick face).
  const pt = await page.evaluate(() => {
    const t = [...document.querySelectorAll('svg text')].find(x => x.textContent.trim() === 'KICK 1')
    if (!t) return null
    const r = t.getBoundingClientRect()
    return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]
  })
  console.log('KICK 1 label at', pt)
  if (pt) {
    await page.mouse.click(pt[0], pt[1]); await sleep(1200)
    const status = await page.evaluate(() => [...document.querySelectorAll('span, div')].map(e => e.textContent ?? '')
      .find(t => /^(base|tall|wall)[\w ]* · [^·]+ · \d+×\d+×\d+$/.test(t.trim()))?.trim() ?? '(nothing)')
    console.log('click on kick →', status)
    const handles = await page.evaluate(() => ({
      stretch: [...document.querySelectorAll('circle')].filter(c => c.style.cursor === 'ew-resize').length,
      depth:   [...document.querySelectorAll('circle')].filter(c => c.style.cursor === 'crosshair').length,
      move:    [...document.querySelectorAll('g')].filter(g => g.style.cursor === 'move' || g.style.cursor === 'crosshair').length,
    }))
    console.log('selected handles:', JSON.stringify(handles))
  }
  await page.screenshot({ path: path.join(OUT, 'kick-plan-selected.png') })
} finally { await browser.close() }
