import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
const R = '5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3'
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await new Promise(r => setTimeout(r, 4000))
  const st = await page.evaluate(() => window.__canvasApi.getState())
  console.log(JSON.stringify(st.walls))
  for (const c of st.cabinets) console.log(JSON.stringify(c))
  for (const f of st.fixtures) console.log('FX', JSON.stringify(f))
} finally { await browser.close() }
