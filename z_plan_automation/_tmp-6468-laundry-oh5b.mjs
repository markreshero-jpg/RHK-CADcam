// Rev 3 follow-up: kick to 2183 under the narrower BC-01/02, tub + tap re-centred on BC-01 (-1.25).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = '874fed25-8e1b-4bbf-b1ff-3090361b5dad'
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 240000 }); await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(4000)
  const api = async (m, ...a) => { const r = await page.evaluate((m, a) => window.__canvasApi[m](...a), m, a); await sleep(2000); return r }
  console.log(JSON.stringify(await api('updateCabinet', 'KICK 1', { dx: 2183 })))
  for (const [id, x] of [['3a17e747-f31a-4957-8392-986845db7be8', -1570.25], ['06a6a562-d7bd-476a-b9e1-852d0be6845e', -1327.7]]) {
    const y = (await page.evaluate(() => window.__canvasApi.getState())).fixtures.find(f => f.id === id)?.y
    console.log(JSON.stringify(await api('updateFixture', id, y != null ? { x, y } : { x })))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  console.log(JSON.stringify((st.cabinets ?? []).filter(c => /BC|KICK/.test(c.label)).map(c => ({ l: c.label, off: c.offset, dx: c.dx }))))
  console.log(JSON.stringify((st.fixtures ?? []).map(f => ({ name: f.name, x: f.x, cabinet: f.cabinet, clash: f.clash }))))
} finally { await browser.close() }
