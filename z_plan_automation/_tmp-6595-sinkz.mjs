// RHK6595: Lucia drop-in (plan) - flange on the 950 bench surface: z = 950 - 200 = 750.
import puppeteer from 'puppeteer-core'
const ROOM = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', FIX = 'dda70361-28dd-456a-bbb1-00634152ded2'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(6000)
  await page.evaluate(id => window.__canvasApi.updateFixture(id, { z: 750 }), FIX); await sleep(4000)
  const f = (await page.evaluate(() => window.__canvasApi.getState())).fixtures.find(x => x.id === FIX)
  console.log(JSON.stringify({ x: f.x, y: f.y, z: f.z, cabinet: f.cabinet, clash: f.clash }))
} finally { await browser.close() }
