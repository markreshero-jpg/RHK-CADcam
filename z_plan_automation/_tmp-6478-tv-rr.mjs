// re-resolve DS TV Unit fillers after the Teak 16 swap
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = process.argv[2], labels = process.argv.slice(3)
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  for (const l of labels) { const rp = await api('getResolved', l); const ps = [...(rp.custom_parts ?? []), ...(rp.parts ?? [])].filter(p => /fill|appl/i.test(p.part_type + p.name)); console.log(l, JSON.stringify(ps.map(p => [p.name ?? p.part_type, p.material_name ?? p.material_id, p.DZ])) ) }
  for (const l of labels) { const s = await api('getState'); const c = (s.cabinets ?? []).find(c => c.label === l); console.log(JSON.stringify(await api('updateCabinet', l, { dz: Number(c?.dz ?? c?.DZ) }))); await sleep(1500) }
  const issues = await api("getIssues"); for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) console.log("  ", ci.label, e.code, e.message)
} finally { await browser.close() }
