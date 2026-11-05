// Construct Building: re-resolve the 7 loose-part carriers after the custom-part rewrite.
import puppeteer from 'puppeteer-core'
const R = '773dd73b-74d6-4f0d-8710-eb9db0e0372f'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000 }, protocolTimeout: 300000 })
const W = { 'TC-01': 550, 'TC-02': 60, 'TC-03': 60, 'TC-04': 70, 'TC-05': 70, 'TC-06': 70, 'TC-07': 70 }
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(5000)
  const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
  for (const [label, dx] of Object.entries(W)) console.log(label, JSON.stringify(await api('updateCabinet', label, { dx, dz: 16.5 })))
  console.log('issues', JSON.stringify(await api('getIssues')).slice(0, 800))
} finally { await browser.close() }
