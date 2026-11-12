// RHK6456 Morris: re-resolve the 3 DishDrawer loose-part carriers after the custom-part rewrite.
import puppeteer from 'puppeteer-core'
const R = '7923445f-73fc-4e1c-bd0e-54eb736324ad'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000 }, protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(5000)
  const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
  for (const label of ['TC-01', 'TC-02', 'TC-03']) console.log(label, JSON.stringify(await api('updateCabinet', label, { dx: 600, dz: 18 })))
  console.log('issues', JSON.stringify(await api('getIssues')).slice(0, 1200))
} finally { await browser.close() }
