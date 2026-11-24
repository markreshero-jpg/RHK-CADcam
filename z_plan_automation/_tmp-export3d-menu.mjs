// z_html_export: Room › Export 3D… dialog, desktop + phone, started from the plan view.
// node z_plan_automation/_tmp-export3d-menu.mjs <roomId> <outDir>
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
const [roomId, outDir] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], protocolTimeout: 600000 })
const clickText = (p, text) => p.evaluate(t => {
  const el = [...document.querySelectorAll('nav button')].find(x => x.textContent.includes(t))
  if (!el) return false
  el.click(); return true
}, text)
try {
  for (const phone of [false, true]) {
    const tag = phone ? 'phone' : 'desktop'
    const p = await b.newPage()
    await p.setViewport(phone ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: 1600, height: 1000 })
    p.on('pageerror', e => console.log(tag, 'PAGEERROR', e.message.slice(0, 200)))
    const cdp = await p.createCDPSession()
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: outDir })
    await p.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    await p.goto(`http://localhost:3001/canvas/${roomId}`, { waitUntil: 'networkidle2', timeout: 240000 })
    await p.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(3000)
    console.log(tag, 'toolbar button gone:', !(await p.$('[data-tour="export-3d-html"]')))
    if (phone) console.log(tag, 'open Menu', await clickText(p, 'Menu ▾'))
    else await p.click('[data-tour="menu-Room"]')
    await sleep(400)
    await p.screenshot({ path: `${outDir}/${tag}-menu.png` })
    console.log(tag, 'click Export 3D…', await clickText(p, 'Export 3D…'))
    await p.waitForSelector('[data-tour="export-3d-file"]', { timeout: 10000 })
    await p.screenshot({ path: `${outDir}/${tag}-dialog.png` })
    await p.click('[data-tour="export-3d-file"]')
    let toast = null
    for (let i = 0; i < 120 && !toast; i++) {
      await sleep(1000)
      toast = await p.evaluate(() => [...document.querySelectorAll('div,span,p')].reverse().map(d => d.textContent).find(s => /^Saved .*3D\.html|3D export failed/.test(s ?? '') && (s ?? '').length < 300) ?? null)
    }
    console.log(tag, 'TOAST', toast)
    await sleep(2000)
    await p.screenshot({ path: `${outDir}/${tag}-after.png` })
    console.log(tag, 'dialog closed:', !(await p.$('[data-tour="export-3d-file"]')), 'files:', fs.readdirSync(outDir).filter(f => f.endsWith('.html')))
    await p.close()
  }
} finally { await b.close() }
