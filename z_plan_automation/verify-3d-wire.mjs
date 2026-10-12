// Room 3D Solid / Wire dropdown (3D tab ▾). Opens the dropdown, picks Wire view,
// screenshots before / menu open / after, and reports the tab label.
import puppeteer from 'puppeteer-core'
const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'], defaultViewport: { width: 1500, height: 950 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 200)) })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(4000)
  const clickAt = async sel => { const h = await page.$(sel); if (!h) throw new Error('missing ' + sel); const b = await h.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2) }
  const btnByText = async t => page.evaluateHandle(x => [...document.querySelectorAll('button')].find(e => e.textContent.trim() === x && e.offsetParent !== null), t)
  const clickText = async t => { const h = await btnByText(t); const b = await h.asElement()?.boundingBox(); if (!b) throw new Error('no button ' + t); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2) }
  await clickText('3D'); await sleep(8000)
  await page.screenshot({ path: `${OUT}/wire-0-solid.png` })
  await clickAt('button[title="3D view style"]'); await sleep(800)
  await page.screenshot({ path: `${OUT}/wire-1-menu.png` })
  console.log('hit at Wire view:', await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Wire view'); const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return [JSON.stringify(r), el?.tagName, el?.className?.toString().slice(0, 120), b.contains(el)] }))
  console.log('menu items visible:', await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /view$/.test(b.textContent.trim()) && b.offsetParent).map(b => b.textContent.trim())))
  await clickText('Wire view').catch(e => console.log('click wire failed:', e.message)); await sleep(6000)
  console.log('tab labels:', await page.evaluate(() => [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => t.startsWith('3D'))))
  console.log('pref:', await page.evaluate(() => localStorage.getItem('rhk_user_prefs')?.match(/"room3DStyle":"\w+"/)?.[0]))
  await page.screenshot({ path: `${OUT}/wire-2-after.png` })
} finally { await browser.close() }
