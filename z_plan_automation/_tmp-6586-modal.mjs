// Temp: open a cabinet's edit modal headless and screenshot (3D tab).  node _tmp-6586-modal.mjs <roomId> <label> <out.png> [tabText]
import puppeteer from 'puppeteer-core'
const [ROOM, LABEL, OUT, TAB] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000 } })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 }); await sleep(4000)
  await page.evaluate(l => window.__canvasApi.openCabinet(l), LABEL); await sleep(6000)
  if (TAB) { await page.evaluate(t => [...document.querySelectorAll('button')].filter(e => e.offsetParent && e.textContent.trim() === t).pop()?.click(), TAB); await sleep(6000) }
  await page.screenshot({ path: OUT })
} finally { await browser.close() }
