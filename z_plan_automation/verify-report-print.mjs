// Reports Print button + print presets (2026-11-02): in each drawing report the
// presets bar shows, a preset sets paper / scale / layer sets, and Print builds the
// PDF and hands it to the print frame (an iframe on a blob: PDF) instead of saving.
//   node z_plan_automation/verify-report-print.mjs <roomId>
import puppeteer from 'puppeteer-core'

const [ROOM] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1720, height: 1100 } })
let pass = true
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) pass = false }
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message.slice(0, 200)))
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
  await sleep(4000)
  const clickText = async (t, sel = 'button, div, span, li, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].reverse().find(e => e.textContent.trim() === t && e.offsetParent !== null); if (el) el.click(); return !!el }, t, sel)
    if (!ok) throw new Error('not found: ' + t)
    await sleep(800)
  }
  // Record print frames instead of letting them print.
  await page.evaluate(() => {
    window.__frames = []
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.tagName === 'IFRAME') window.__frames.push(n.src) }))).observe(document.body, { childList: true })
  })
  await clickText('Reports'); await clickText('Room Reports…')
  for (const rep of ['shop_drawings', 'plan_view_v2', 'benchtop_quote', 'elevation_view_v2', 'cabinet_sheets', 'render_3d']) {
    await page.click(`[data-tour="report-${rep}"]`)
    await sleep(2500)
    const chips = await page.evaluate(() => [...document.querySelectorAll('[data-print-presets] span > button:first-child')].map(b => b.textContent))
    console.log(`\n${rep}: presets [${chips.join(' | ')}]`)
    check(`${rep}: presets bar shown`, await page.$('[data-print-presets]') !== null)
    if (chips.length) {
      const name = chips[chips.length - 1]
      await page.evaluate(n => [...document.querySelectorAll('[data-print-presets] span > button:first-child')].find(b => b.textContent === n).click(), name)
      await sleep(3000)
      const st = await page.evaluate(() => ({
        selects: [...document.querySelectorAll('.fixed select')].map(s => s.selectedOptions[0]?.textContent),
      }))
      console.log(`  applied "${name}":`, st.selects.join(', '))
      if (name.includes('A4')) check(`${rep}: A4 preset sets the paper`, st.selects.includes('A4 Landscape'))
      if (name.includes('1:30')) check(`${rep}: preset sets the scale`, st.selects.includes('1:30'))
      if (name.includes('Line Drawing Print')) check(`${rep}: preset sets the layer set`, st.selects.includes('Line Drawing Print'))
      if (name.includes('Benchtops')) check(`${rep}: preset sets the layer set`, st.selects.includes('Benchtops'))
    }
    // Print, once the button is enabled.
    await page.waitForFunction(() => { const b = document.querySelector('[data-report-print]'); return b && !b.disabled }, { timeout: 120000 }).catch(() => {})
    const before = await page.evaluate(() => window.__frames.length)
    await page.evaluate(() => document.querySelector('[data-report-print]')?.click())
    await page.waitForFunction(n => window.__frames.length > n, { timeout: 120000 }, before).catch(() => {})
    const src = await page.evaluate(() => window.__frames.at(-1) ?? '')
    check(`${rep}: Print hands a blob PDF to the print frame`, (await page.evaluate(() => window.__frames.length)) > before && src.startsWith('blob:'))
  }
} catch (e) {
  console.log('FAILED', e.message); pass = false
} finally {
  await browser.close()
  console.log(pass ? '\nALL PASS' : '\nSOME CHECKS FAILED')
}
