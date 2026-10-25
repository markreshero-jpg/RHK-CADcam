// Cross section (z_section_view): open a room's elevation, turn on Cross section,
// drag the cut line (elevation, right-hand column) to a few spots and screenshot
// the section (main canvas) each time.
//   node z_plan_automation/verify-cross-section.mjs <outDir>   (ROOM_ID, WALL = wall-picker button text)
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const clickText = (page, t) => page.evaluate(t => {
  const b = [...document.querySelectorAll('button')].reverse().find(e => e.textContent.trim() === t && e.offsetParent !== null)
  b?.click(); return !!b
}, t)

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') console.log('console ' + m.type() + ':', m.text().slice(0, 300)) })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(5000)
  console.log('elevation tab', await clickText(page, 'Elevation'))
  await sleep(2500)
  if (process.env.WALL) console.log('wall', await clickText(page, process.env.WALL))
  await sleep(1500)
  await page.screenshot({ path: path.join(OUT, 'xs-0-elev.png') })
  if (process.env.LAYER_SET) console.log('layer set', await page.evaluate(n => {
    const sel = [...document.querySelectorAll('select')].find(e => [...e.options].some(o => o.text === 'Line drawing'))
    const o = sel && [...sel.options].find(o => o.text === n); if (!o) return [...(sel?.options ?? [])].map(o => o.text)
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, o.value)
    sel.dispatchEvent(new Event('change', { bubbles: true })); return n
  }, process.env.LAYER_SET))
  await sleep(1000)
  console.log('toggle', await clickText(page, 'Cross section'))
  await sleep(3000)
  await page.screenshot({ path: path.join(OUT, 'xs-1-on.png') })

  // Drag the cut line (its transparent hit line) across the wall.
  const findHit = () => page.evaluate(() => {
    const l = [...document.querySelectorAll('line')].find(e => e.getAttribute('stroke') === 'transparent' && e.style.cursor === 'ew-resize')
    if (!l) return null
    const r = l.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  const hit = await findHit()
  console.log('hit line', hit)
  const paths = () => page.evaluate(() => [...document.querySelectorAll('svg path[fill-rule="evenodd"]')].length)
  if (hit) {
    for (const [i, dx] of (process.env.DRAGS ?? '-120,60,90').split(',').map(Number).entries()) {
      const { x } = await findHit()
      await page.mouse.move(x, hit.y); await page.mouse.down()
      await page.mouse.move(x + dx / 2, hit.y, { steps: 5 }); await page.mouse.move(x + dx, hit.y, { steps: 5 })
      await page.mouse.up()
      await sleep(600)
      const at = await page.evaluate(() => [...document.querySelectorAll('input[type=number]')].find(e => e.className.includes('violet'))?.value)
      console.log(`drag ${i}: at`, at, 'cut paths', await paths())
      console.log('  by item', JSON.stringify(await page.evaluate(() => { const m = {}; for (const e of document.querySelectorAll('svg [data-item]')) m[e.dataset.item] = (m[e.dataset.item] ?? 0) + 1; return m })))
      await page.screenshot({ path: path.join(OUT, `xs-2-drag${i}.png`) })
    }
  }
  console.log('bench', await page.evaluate(() => { const e = document.querySelector('path[data-item=benchtops]'); return e && [e.getAttribute('d').slice(0, 400), e.getAttribute('fill'), e.getAttribute('fill-opacity')] }))
  // Zoom the section in (page coords).
  await page.mouse.move(Number(process.env.ZX ?? 640), Number(process.env.ZY ?? 420))
  for (let i = 0; i < Number(process.env.ZN ?? 3); i++) { await page.mouse.wheel({ deltaY: -300 }); await sleep(120) }
  await sleep(400)
  await page.screenshot({ path: path.join(OUT, 'xs-zoom.png') })
  console.log('flip', await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim().startsWith('Flip')); b?.click(); return !!b }))
  await sleep(800)
  await page.screenshot({ path: path.join(OUT, 'xs-3-flip.png') })
} finally {
  await browser.close()
}
