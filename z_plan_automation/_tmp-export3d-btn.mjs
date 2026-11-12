// Test z_html_export H1: click "Export 3D" in the room 3D view, capture the download, open it.
import puppeteer from 'puppeteer-core'
import fs from 'fs'
const [roomId, outDir] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], protocolTimeout: 600000 })
try {
  const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000 })
  p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); p.on('dialog', d => d.dismiss())
  await p.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const cdp = await p.createCDPSession()
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: outDir.split('/').join(String.fromCharCode(92)) })
  await p.goto(`http://localhost:3001/canvas/${roomId}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await p.waitForFunction('!!window.__canvasApi', { timeout: 90000 })
  await p.click('[data-tour="view-3d"]')
  await p.waitForSelector('[data-tour="export-3d-html"]', { timeout: 60000 })
  await sleep(12000)
  await p.click('[data-tour="export-3d-html"]')
  let f
  for (let i = 0; i < 60 && !f; i++) { await sleep(1000); f = fs.readdirSync(outDir).find(n => n.endsWith('.html')) }
  console.log('download', f)
  await p.screenshot({ path: `${outDir}/app.png` })
  const v = await b.newPage(); await v.setViewport({ width: 1400, height: 900 })
  v.on('pageerror', e => console.log('VIEWERERR', e.message)); v.on('console', m => m.type() === 'error' && console.log('VCONSOLE', m.text()))
  await v.goto('file:///' + `${outDir}/${f}`, { waitUntil: 'networkidle0', timeout: 120000 })
  await v.waitForFunction('!!window.__toggle', { timeout: 60000 }); await sleep(2000)
  console.log('doors', await v.evaluate(() => window.__toggle.doors()))
  await v.screenshot({ path: `${outDir}/v-solid.png` })
  await v.click('#reset'); await sleep(800); await v.screenshot({ path: `${outDir}/v-reset.png` })
  await v.click('#doors'); await sleep(800); await v.screenshot({ path: `${outDir}/v-nodoors.png` })
  await v.click('#wire'); await sleep(1500); await v.screenshot({ path: `${outDir}/v-wire.png` })
} finally { await b.close() }
