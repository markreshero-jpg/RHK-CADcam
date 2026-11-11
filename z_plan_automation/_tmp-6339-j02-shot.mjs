// RHK6339 J02: plan / Wall 2 elevation / 3D shots.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
const R = '67a27d07-1012-4537-a58d-5d3b50764221'
const OUT = process.argv[2]
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000 }, protocolTimeout: 300000 })
const click = (page, t, last) => page.evaluate(([t, last]) => { const b = [...document.querySelectorAll('button')].filter(e => e.textContent.trim() === t && e.offsetParent); (last ? b.pop() : b[0])?.click(); return b.length }, [t, last])
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 }); await sleep(4000)
  if (process.argv[3] === 'fix') {
    for (const l of ['BC-01']) { console.log(JSON.stringify(await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dz: 676 }), l))); await sleep(1500) }
    const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
    for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
    console.log('issues', n)
    await page.reload({ waitUntil: 'networkidle2' }); await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 }); await sleep(4000)
  }
  await click(page, 'Plan'); await sleep(4000); await page.screenshot({ path: OUT + 'plan.png' })
  await click(page, 'Elevation'); await sleep(4000)
  for (const w of ['Wall 2']) { console.log(w, await page.evaluate(t => { const b = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() === t && e.offsetParent); b[0]?.click(); return b.length }, w)); await sleep(4000); await page.screenshot({ path: OUT + w.replace(' ', '') + '.png' }) }
  await click(page, '3D'); await sleep(8000); await page.screenshot({ path: OUT + '3d.png' })
} finally { await browser.close() }
