// z_html_export H6 test: Export 3D › Share link, then open the link logged out.
import puppeteer from 'puppeteer-core'
const [roomId, outDir] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], protocolTimeout: 600000 })
try {
  const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000 })
  let link
  p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
  p.on('dialog', d => { link = d.defaultValue(); d.dismiss() })
  p.on('console', m => /share|failed/i.test(m.text()) && console.log('CONSOLE', m.text().slice(0, 200)))
  await p.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await p.goto(`http://localhost:3001/canvas/${roomId}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await p.waitForFunction('!!window.__canvasApi', { timeout: 120000 })
  await p.click('[data-tour="view-3d"]')
  await p.waitForSelector('[data-tour="export-3d-html"]', { timeout: 60000 }); await sleep(10000)
  await p.click('[data-tour="export-3d-html"]'); await sleep(300); await p.click('[data-tour="export-3d-link"]')
  for (let i = 0; i < 180 && !link; i++) {
    await sleep(1000)
    const t = await p.evaluate(() => [...document.querySelectorAll('div,span,p')].reverse().map(d => d.textContent).find(s => /Share link(:| copied)|3D export failed/.test(s ?? '') && (s ?? '').length < 400) ?? null)
    if (t) { console.log('TOAST', t); const m = t.match(/https?:\S+/); if (m) link = m[0]; else if (/failed/.test(t)) break }
  }
  console.log('LINK', link)
  if (!link) process.exit(1)
  // logged-out browser context
  const ctx = await b.createBrowserContext()
  const v = await ctx.newPage(); await v.setViewport({ width: 1200, height: 800 })
  v.on('pageerror', e => console.log('VIEWERERR', e.message))
  const r = await v.goto(link, { waitUntil: 'load', timeout: 120000 })
  console.log('status', r.status(), 'url', v.url())
  await v.waitForFunction('!!window.__ready', { timeout: 120000 }); await sleep(1500)
  await v.click('#reset'); await sleep(800)
  await v.screenshot({ path: `${outDir}/link.png` })
  console.log('ar href', await v.evaluate(() => document.querySelector('#ar')?.getAttribute('href')))
  const bad = await (await ctx.newPage()).goto(link.replace(/.{4}$/, '0000'))
  console.log('bad token status', bad.status())
} finally { await b.close() }
