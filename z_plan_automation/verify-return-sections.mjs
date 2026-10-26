// Return cabinet sections (z_section_view R1): open an elevation, report what the return sections draw, screenshot.
//   node z_plan_automation/verify-return-sections.mjs <outDir>   (ROOM_ID, WALL, LAYER_SET)
import path from 'node:path'
import puppeteer from 'puppeteer-core'
const OUT = process.argv[2], ROOM = process.env.ROOM_ID, WALL = process.env.WALL ?? 'Wall 1'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const clickText = (page, t) => page.evaluate(t => {
  const b = [...document.querySelectorAll('button')].reverse().find(e => e.textContent.trim() === t && e.offsetParent !== null)
  b?.click(); return !!b
}, t)
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error') console.log('console error:', m.text().slice(0, 300)) })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
  await sleep(5000)
  console.log('elevation tab', await clickText(page, 'Elevation'))
  await sleep(2500)
  console.log('wall', await clickText(page, WALL))
  await sleep(6000)
  if (process.env.LAYER_SET) {
    console.log('layer set', await page.evaluate(n => {
      const sel = [...document.querySelectorAll('select')].find(e => e.title === 'Layers')
      const o = sel && [...sel.options].find(o => o.text === n); if (!o) return null
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, o.value)
      sel.dispatchEvent(new Event('change', { bubbles: true })); return n
    }, process.env.LAYER_SET))
    await sleep(3000)
  }
  const info = await page.evaluate(() => {
    const g = document.querySelector('g[data-role="return-sections"]')
    if (!g) return null
    const r = g.getBoundingClientRect()
    const by = {}; for (const e of g.querySelectorAll("[data-item]")) by[e.dataset.item] = (by[e.dataset.item] ?? 0) + 1
    return { at: g.dataset.cutAt, meshes: g.dataset.meshes, by, paths: g.querySelectorAll("path").length, groups: g.querySelectorAll('g').length, rect: { x: r.left, y: r.top, w: r.width, h: r.height } }
  })
  console.log('returns', JSON.stringify(info))
  await page.screenshot({ path: path.join(OUT, 'rs-elev.png') })
  if (info) {
    const { x, y, w, h } = info.rect
    await page.screenshot({ path: path.join(OUT, 'rs-crop.png'), clip: { x: Math.max(0, x - 250), y: Math.max(0, y - 40), width: Math.min(1600, w + 400), height: Math.min(1000, h + 80) } })
  }
} finally { await browser.close() }
