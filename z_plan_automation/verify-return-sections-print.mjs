import path from 'node:path'
import puppeteer from 'puppeteer-core'
const OUT = process.argv[2], ROOM = process.env.ROOM_ID
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
  await sleep(5000)
  const clickText = async (text, sel = 'button, div, span, a') => {
    const ok = await page.evaluate((t, s) => {
      const el = [...document.querySelectorAll(s)].find(e => e.textContent.trim().replace(/^✓/, '') === t && e.offsetParent !== null)
      if (el) { el.click(); return true } return false
    }, text, sel)
    if (!ok) throw new Error('not found: ' + text)
    await sleep(800)
  }
  await page.evaluate(() => window.__canvasApi?.openReportModal?.('room'))
  await sleep(800)
  if (!(await page.evaluate(() => document.body.innerText.includes('Plan View')))) { await clickText('Reports', 'button'); await clickText('Room Reports…', 'button') }
  await clickText('Elevation Views', 'button, div')
  await page.waitForSelector('svg[data-vb-w]', { timeout: 30000 })
  await sleep(8000)
  const stats = await page.evaluate(() => [...document.querySelectorAll('svg[data-vb-w]')].map(svg => {
    const g = svg.querySelector('g[data-role="return-sections"]')
    const t = svg.querySelector('text')?.textContent
    if (!g) return { t, returns: null }
    const by = {}; for (const e of g.querySelectorAll('[data-item]')) by[e.dataset.item] = (by[e.dataset.item] ?? 0) + 1
    return { t, at: g.dataset.cutAt, meshes: g.dataset.meshes, by }
  }))
  console.log(JSON.stringify(stats))
  const svgs = await page.$$('svg[data-vb-w]')
  for (let i = 0; i < svgs.length; i++) await svgs[i].screenshot({ path: path.join(OUT, `rs-print-${i}.png`) })
} finally { await browser.close() }
