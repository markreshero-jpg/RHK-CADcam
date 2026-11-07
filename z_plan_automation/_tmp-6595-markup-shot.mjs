// Kick dims on the print sheets: Plan View + Elevation Views with the Kicks layer set.
import puppeteer from 'puppeteer-core'
const R = process.argv[3] ?? 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6'
const OUT = process.argv[2]
const SETNAME = process.argv[4] ?? 'Line Drawing Print'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1800, height: 2600, deviceScaleFactor: 1.3 }, protocolTimeout: 300000 })
const clickText = (page, t) => page.evaluate(t => { const b = [...document.querySelectorAll('button, [role=button], div, span')].filter(e => e.textContent.trim() === t && e.offsetParent); const el = b.find(e => e.tagName === 'BUTTON') ?? b[0]; el?.click(); return b.length }, t)
const pickReport = (page, t) => page.evaluate(t => { const b = [...document.querySelectorAll('button, div')].filter(e => e.offsetParent && e.textContent.trim().startsWith(t)); b[b.length - 1]?.click(); return b.length }, t)
const pickKicks = page => page.evaluate((SET) => {
  const sel = [...document.querySelectorAll('select')].filter(s => s.offsetParent && [...s.options].some(o => o.text.trim() === SET))
  for (const s of sel) {
    const o = [...s.options].find(o => o.text.trim() === SET)
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    setter.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true }))
  }
  return sel.length
}, SETNAME)
const shoot = async (page, prefix) => {
  let n = 0
  for (const h of await page.$$('svg')) {
    const bb = await h.boundingBox(); if (!bb || bb.width < 900) continue
    if (!(await h.evaluate(e => !!e.closest('[class*=fixed]')))) continue
    await h.screenshot({ path: OUT + `${prefix}${n++}.png` })
  }
  return n
}
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 120000 }); await sleep(6000)
  await clickText(page, 'Reports'); await sleep(1500)
  await clickText(page, 'Room Reports…'); await sleep(3000)
  console.log('plan', await pickReport(page, 'Plan View')); await sleep(4000)
  
  console.log('plan sheets', await shoot(page, 'plan'))
  await clickText(page, 'Reports'); await sleep(1500)
  console.log('elev', await pickReport(page, 'Elevation')); await sleep(4000)
  await pickKicks(page); await sleep(6000)
  console.log('elev sheets', await shoot(page, 'elev'))
} finally { await browser.close() }
