// Temp: plan + elevation (+ optional 3D) screenshots of a room.  node _tmp-shots.mjs <roomId> <outDir> [wall]
import path from 'node:path'
import puppeteer from 'puppeteer-core'
const [ROOM, OUT, WALL = 'Wall 1'] = process.argv.slice(2)
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
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
  await sleep(5000)
  await page.screenshot({ path: path.join(OUT, 'plan.png') })
  console.log('elevation tab', await clickText(page, 'Elevation'))
  await sleep(2500)
  console.log('wall', await clickText(page, WALL))
  await sleep(6000)
  await page.screenshot({ path: path.join(OUT, 'elev.png') })
  console.log('3d tab', await clickText(page, '3D'))
  await sleep(9000)
  console.log('reset', await clickText(page, '⟲ Reset view') || await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Reset view')); b?.click(); return !!b }))
  await sleep(4000)
  await page.screenshot({ path: path.join(OUT, '3d.png') })
} finally { await browser.close() }
