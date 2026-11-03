// Export each room's live 3D scene as a GLB via window.__room3d (dev bridge).
import puppeteer from 'puppeteer-core'
import fs from 'fs'
const [outDir, ...rooms] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], protocolTimeout: 900000 })
try {
  for (const roomId of rooms) {
    const page = await browser.newPage()
    await page.setViewport({ width: 1600, height: 1000 })
    page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
    await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    await page.goto(`http://localhost:3001/canvas/${roomId}`, { waitUntil: 'networkidle2', timeout: 90000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 })
    const name = await page.evaluate(() => window.__canvasApi.getState().room?.name)
    await page.click('[data-tour="view-3d"]')
    await page.waitForFunction('!!window.__room3d', { timeout: 60000 })
    await sleep(12000)   // part details + GLB models settle
    const b64 = await page.evaluate(() => window.__room3d.exportGLB())
    const f = `${outDir}/${(name ?? roomId).replace(/[^\w-]+/g, '_')}.glb`
    fs.writeFileSync(f, Buffer.from(b64, 'base64'))
    await page.screenshot({ path: f.replace('.glb', '.png') })
    console.log(name, f, Math.round(b64.length * 0.75 / 1024), 'KB')
    await page.close()
  }
} finally { await browser.close() }
