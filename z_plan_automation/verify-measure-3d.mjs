// Room 3D measure tool (plane to plane): open the room in 3D, turn Measure on,
// hover / click the screen points given as args ("x,y" pairs; "h:x,y" = hover
// only), screenshotting after each step into OUT.
//   node z_plan_automation/verify-measure-3d.mjs <outDir> [h:]x,y ...
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const [OUT = '.', ...steps] = process.argv.slice(2)
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'], defaultViewport: { width: 1500, height: 950 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 300)) })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(4000)
  const clickBtn = async t => { const ok = await page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim().endsWith(x) && e.offsetParent !== null); if (b) { b.click(); return true } return false }, t); if (!ok) throw new Error('no button ' + t) }
  await clickBtn('3D')
  await sleep(9000)
  await clickBtn('Measure')
  await sleep(800)
  await page.screenshot({ path: path.join(OUT, 'm3d-0.png') })
  let i = 0
  for (const s of steps) {
    i++
    const hoverOnly = s.startsWith('h:')
    const [x, y] = s.replace('h:', '').split(',').map(Number)
    await page.mouse.move(x - 3, y - 3); await sleep(150)
    await page.mouse.move(x, y); await sleep(600)
    if (!hoverOnly) { await page.mouse.down(); await sleep(60); await page.mouse.up(); await sleep(600) }
    await page.screenshot({ path: path.join(OUT, `m3d-${i}.png`) })
    const label = await page.evaluate(() => [...document.querySelectorAll('div')].filter(d => / mm$/.test(d.textContent.trim()) && d.children.length === 0).map(d => d.parentElement.textContent.trim()))
    console.log(`step ${i} ${s}:`, JSON.stringify(label))
  }
} finally {
  await browser.close()
}
