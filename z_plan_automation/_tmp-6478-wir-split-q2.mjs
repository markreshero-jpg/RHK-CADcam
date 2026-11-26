// RHK6478 Master WIR: fixed shelves + split suggestions of the 2554 cabinets (query only).
import puppeteer from 'puppeteer-core'
const R = 'e58340a6-4b68-4543-a1ca-a686b515a647'
const L = ['TC-08', 'TC-09', 'TC-10', 'TC-11', 'TC-12', 'TC-13', 'TC-14', 'TC-15', 'TC-17']
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(6000)
  for (const l of L) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    if (!rp) { console.log(l, 'no resolve'); continue }
    const ip = rp.internal_parts ?? []
    const fx = ip.filter(p => p.part_type === 'fixed_shelf').map(p => `Y${p.Y} DZ${p.DZ} top ${Math.round((p.Y + p.DZ) * 10) / 10}`)
    const types = [...new Set(ip.map(p => p.part_type))].join(',')
    console.log(l, 'fixed:', fx.join(' | ') || 'NONE', '| types', types)
  }
} finally { await browser.close() }
