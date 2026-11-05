// Re-resolve + persist every cabinet in a room (no other changes) and print issues.  node _tmp-reresolve-room.mjs <roomId>
import puppeteer from 'puppeteer-core'
const [ROOM] = process.argv.slice(2)
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss()); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi'); await new Promise(r => setTimeout(r, 1500))
  const iss = await page.evaluate(() => window.__canvasApi.getIssues())
  console.log('re-resolved', iss.length, 'cabinets')
  for (const x of iss) if (x.errors.length || x.warnings.length) console.log(' ', x.label, JSON.stringify([...x.errors, ...x.warnings].map(e => e.code + ' ' + e.message)))
} finally { await browser.close() }
