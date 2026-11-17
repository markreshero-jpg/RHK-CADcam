import puppeteer from 'puppeteer-core'
import fs from 'fs'
const [roomId, outDir] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
for (const f of fs.readdirSync(outDir)) fs.unlinkSync(`${outDir}/${f}`)
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], protocolTimeout: 600000 })
try {
  const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000 })
  p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); p.on('dialog', d => d.dismiss())
  await p.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const cdp = await p.createCDPSession()
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: outDir.split('/').join(String.fromCharCode(92)) })
  await p.goto(`http://localhost:3001/canvas/${roomId}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await p.waitForFunction('!!window.__canvasApi', { timeout: 120000 })
  await p.click('[data-tour="view-3d"]')
  await p.waitForSelector('[data-tour="export-3d-html"]', { timeout: 60000 })
  await sleep(12000)
  for (const [tour, ext] of [['export-3d-file', '.html'], ['export-3d-usdz', '.usdz']]) {
    await p.click('[data-tour="export-3d-html"]'); await sleep(300)
    if (tour === 'export-3d-file') await p.screenshot({ path: `${outDir}/menu.png` })
    await p.click(`[data-tour="${tour}"]`)
    let f
    for (let i = 0; i < 90 && !f; i++) { await sleep(1000); f = fs.readdirSync(outDir).find(n => n.endsWith(ext)) }
    console.log('download', f, f && fs.statSync(`${outDir}/${f}`).size)
  }
  const f = fs.readdirSync(outDir).find(n => n.endsWith('.html'))
  const v = await b.newPage(); await v.setViewport({ width: 1400, height: 900 })
  // offline: block every network request except the file itself
  await v.setRequestInterception(true)
  v.on('request', r => r.url().startsWith('file:') || r.url().startsWith('data:') ? r.continue() : (console.log('BLOCKED', r.url().slice(0, 80)), r.abort()))
  v.on('pageerror', e => console.log('VIEWERERR', e.message)); v.on('console', m => m.type() === 'error' && console.log('VCONSOLE', m.text()))
  await v.goto('file:///' + `${outDir}/${f}`, { waitUntil: 'load', timeout: 120000 })
  await v.waitForFunction('!!window.__ready', { timeout: 90000 }); await sleep(2000)
  console.log('doors', await v.evaluate(() => window.__toggle.doors()))
  await v.screenshot({ path: `${outDir}/v-solid.png` })
  await v.click('#doors'); await sleep(800); await v.screenshot({ path: `${outDir}/v-nodoors.png` })
  // JS off = what Quick Look / mail preview shows
  const q = await b.newPage(); await q.setViewport({ width: 900, height: 600 }); await q.setJavaScriptEnabled(false)
  await q.goto('file:///' + `${outDir}/${f}`, { waitUntil: 'load' }); await q.screenshot({ path: `${outDir}/nojs.png` })
} finally { await b.close() }
