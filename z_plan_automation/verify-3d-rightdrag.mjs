// Room 3D: right-drag pans without opening a menu; a static right-click opens one.
import puppeteer from 'puppeteer-core'
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'], defaultViewport: { width: 1500, height: 950 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(4000)
  await page.evaluate(() => [...document.querySelectorAll('button')].find(e => e.textContent.trim().startsWith('3D') && e.offsetParent)?.click())
  await sleep(8000)
  const menuOpen = () => page.evaluate(() => /Wall Visibility|Edit cabinet|Delete/i.test([...document.querySelectorAll('div.fixed')].map(d => d.innerText).join(' ')))
  const at = [400, 850]   // empty floor area near the bottom-left
  // Right-drag
  await page.mouse.move(...at); await page.mouse.down({ button: 'right' })
  for (let i = 1; i <= 10; i++) { await page.mouse.move(at[0] + i * 15, at[1] - i * 5); await sleep(20) }
  await page.mouse.up({ button: 'right' }); await sleep(600)
  console.log('after right-drag, menu open:', await menuOpen())
  // Static right-click
  await page.mouse.click(...at, { button: 'right' }); await sleep(600)
  console.log('after static right-click, menu open:', await menuOpen())
} finally { await browser.close() }
