// RHK6586 kitchenette (Mark 2026-10-31): island-type host line for the pantry bulkhead + BH on it.
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
  const w = await page.evaluate(() => window.__canvasApi.placeCabinet({ def: 'BH', wall: '582fa3c3-9db2-47da-86ab-0197ad92ae5d', offset: 0, dx: 453.2 }))
  console.log('WALL', JSON.stringify(w)); await sleep(1500)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  console.log('CABS', JSON.stringify(st.cabinets.filter(c => c.wall === 'Pantry BH line')))
}
finally { await browser.close() }
