import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = 'e58340a6-4b68-4543-a1ca-a686b515a647', labels = process.argv.slice(2)
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  for (const l of labels) {
    const rp = await api('getResolved', l)
    console.log('==', l)
    for (const k of ['case_parts', 'custom_parts', 'internal_parts', 'bulkhead_parts', 'face_zones', 'drawer_stacks']) for (const p of rp[k] ?? []) console.log(' ', k, p.part_key ?? p.part_type ?? p.name, 'X', p.X ?? p.x, 'Y', p.Y ?? p.y, 'Z', p.Z ?? p.z, 'DX', p.DX ?? p.dx, 'DY', p.DY ?? p.dy, 'DZ', p.DZ ?? p.dz, p.expressions ? JSON.stringify(p.expressions) : '')
    console.log('  keys', Object.keys(rp).join(','))
  }
} finally { await browser.close() }
