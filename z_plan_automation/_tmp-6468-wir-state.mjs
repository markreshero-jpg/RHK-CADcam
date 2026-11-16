import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = 'dfa682a3-020b-4704-8661-3dbbd6cdf224'
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 240000 }); await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(4000)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  console.log(Object.keys(st.cabinets[0]).join(','))
  for (const c of st.cabinets) console.log(JSON.stringify(Object.fromEntries(Object.entries(c).filter(([k]) => !/parts|grid|footprint|shape/i.test(k)))))
} finally { await browser.close() }
