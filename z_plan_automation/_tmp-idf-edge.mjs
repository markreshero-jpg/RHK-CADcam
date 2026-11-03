// check inner drawer front edging on a live re-resolve
import puppeteer from 'puppeteer-core'
const [R, L] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(4000)
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  const st = await api('getState'); const c = st.cabinets.find(x => x.label === L)
  await api('updateCabinet', L, { dz: c.dz }); await sleep(2000)
  const rp = await api('getResolved', L)
  console.log(JSON.stringify(rp.internal_parts.filter(p => p.part_type === 'inner_drawer_front').map(p => p.edge_band)))
} finally { await browser.close() }
