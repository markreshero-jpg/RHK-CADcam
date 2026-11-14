// Re-resolve RHK6468 Kitchen cabinets by label (no-op dz / dx patch) + resolver report.
import puppeteer from 'puppeteer-core'
const R = '58bac32f-cdca-4a86-a1a4-c29af7ef9430'
const list = process.argv.slice(2)   // LABEL:field:value
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message); await sleep(1200); return r }
  for (const s of list) { const [l, f, v] = s.split(':'); console.log(l, JSON.stringify(await api('updateCabinet', l, { [f]: Number(v) }))) }
  await sleep(3000)
} finally { await browser.close() }
