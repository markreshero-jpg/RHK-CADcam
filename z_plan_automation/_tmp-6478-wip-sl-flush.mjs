// RHK6478 WIP: WC-10 (pantry shadowline) starts flush with the TC-05 carcass (TC-04 panel inside face, offset 1418),
// WC-09 runs on over the panel to 1418 (Mark 2026-11-03, the "breaks on the carcass line" rule).
import puppeteer from 'puppeteer-core'
const R = 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]); await sleep(2000); return r }
  console.log(JSON.stringify(await api('updateCabinet', 'WC-09', { dx: 1418 })))
  console.log(JSON.stringify(await api('updateCabinet', 'WC-10', { offset: 1418, dx: 930 })))
  const st = await api('getState')
  for (const c of st.cabinets.filter(c => c.wall === 'Wall 5')) console.log(c.label, c.offset, c.dx, c.dz)
  for (const l of ['WC-09', 'WC-10']) {
    const r = await api('getResolved', l)
    console.log(l, JSON.stringify((r?.case_parts ?? []).filter(p => String(p.part_key).startsWith('bh:')).map(p => [p.part_key, p.DX, p.DY])))
  }
  console.log('issues', JSON.stringify((await api('getIssues')).filter(i => i.errors.length || i.warnings.length)))
} finally { await browser.close() }
