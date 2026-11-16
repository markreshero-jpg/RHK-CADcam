// RHK6468 WIR rev 4: TC-01 end panel flush with the 601 nib with an 18 front line (581 + 18 + 2 = 601).
import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = 'dfa682a3-020b-4704-8661-3dbbd6cdf224'
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 240000 }); await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(4000)
  const r = await page.evaluate(async () => { await window.__canvasApi.updateCabinet('TC-01', { dz: 581 }); const x = await window.__canvasApi.getResolved('TC-01'); return x.custom_parts.map(p => `${p.name} ${p.dx}x${p.dy}x${p.dz}`) })
  console.log(r)
} finally { await browser.close() }
