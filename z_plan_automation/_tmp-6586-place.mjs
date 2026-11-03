// RHK6586 kitchenette markups (Mark 2026-10-30): place WOPN corner shelf (Wall 2) + BH over its 45 front (Wall 1).
import puppeteer from 'puppeteer-core'
const ROOM = 'a496c328-cfda-4f74-8c6d-175edd8e5907'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 90000 }); await sleep(2500)
  const st0 = await page.evaluate(() => window.__canvasApi.getState())
  console.log('FIXTURES', JSON.stringify(st0.fixtures))
  const before = new Set(st0.cabinets.map(c => c.label))
  const W1 = st0.walls.find(w => w.name === 'Wall 1').id, W2 = st0.walls.find(w => w.name === 'Wall 2').id
  await page.evaluate(w => window.__canvasApi.placeCabinet({ def: 'WOPN', wall: w, offset: 0, dx: 478.5 }), W2); await sleep(2000)
  await page.evaluate(w => window.__canvasApi.placeCabinet({ def: 'BH', wall: w, offset: 1308, dx: 217.8 }), W1); await sleep(2000)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  console.log('NEW', JSON.stringify(st.cabinets.filter(c => !before.has(c.label))))
} finally { await browser.close() }
