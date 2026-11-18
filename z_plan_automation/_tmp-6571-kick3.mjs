// RHK6571 El B: BC-04's kick as its own kick assembly (KICK 3), like El A / El C - the end panels BC-05 / BC-06 go
// to the floor, so it's the only kick on the wall (Join kicks needs two). Mark 2026-11-18 "join kicks".
import puppeteer from 'puppeteer-core'
const R = '5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi?.detachKick', { timeout: 120000 }); await sleep(5000)
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.detachKick('BC-04')))); await sleep(5000)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets.filter(c => c.wall === 'Wall 4' && !c.label.startsWith('WC'))) console.log('  ', c.label, c.offset, c.dx, c.dy, c.dz)
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) console.log('  ISSUE', ci.label, e.code, e.message)
} finally { await browser.close() }
