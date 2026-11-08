// RHK6595 Loose Parts: re-resolve the 3 loose-part carriers (one face-on piece each on Wall 2), then screenshot the elevation.
import puppeteer from 'puppeteer-core'
const R = 'e01106df-71c7-4db4-9165-3bfc69daa21e'
const SHOT = process.argv[2]
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000 }, protocolTimeout: 300000 })
const W = { 'TC-01': 900, 'TC-02': 70, 'TC-03': 70 }
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(5000)
  const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
  for (const [label, dx] of Object.entries(W)) console.log(label, JSON.stringify(await api('updateCabinet', label, { dx, dz: 16.5 })).slice(0, 200))
  for (const l of Object.keys(W)) { const rp = await api('getResolved', l); console.log(l, JSON.stringify(rp).slice(0, 600)) }
  console.log('issues', JSON.stringify(await api('getIssues')).slice(0, 800))
  console.log('api', Object.keys(await page.evaluate(() => Object.fromEntries(Object.keys(window.__canvasApi).map(k => [k, 1])))).join(','))
  if (SHOT) {
    await page.evaluate(() => window.__canvasApi.setView?.('elevation', 'Wall 2') ?? window.__canvasApi.openElevation?.('Wall 2')).catch(e => console.log('view', e.message))
    await sleep(4000); await page.screenshot({ path: SHOT })
  }
} finally { await browser.close() }
