// RHK6339 J02: fillers TC-02 / TC-03 set back flush with the carcass front (dz 402 -> face 404-421, 19 behind the doors).
import puppeteer from 'puppeteer-core'
const R = '67a27d07-1012-4537-a58d-5d3b50764221'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  for (const l of ['TC-02', 'TC-03']) { console.log(JSON.stringify(await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dz: 402 }), l))); await sleep(3000) }
  for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) for (const e of [...ci.errors, ...ci.warnings]) console.log(' ', ci.label, e.code, e.message)
} finally { await browser.close() }
