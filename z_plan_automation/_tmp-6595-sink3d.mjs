// RHK6595: check the Lucia GLB's handedness in the room 3D - the deep (200) bowl must sit at the higher room-x end
// (the viewer's left, facing Wall 2), same as plan_shape / elev_shape.
import puppeteer from 'puppeteer-core'
const ROOM = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], defaultViewport: { width: 1600, height: 1000 }, protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.evaluateOnNewDocument(() => { window.__scenes = []; window.__THREE_DEVTOOLS__ = { addEventListener() {}, dispatchEvent(e) { if (e?.detail?.type === 'Scene' || e?.detail?.isScene) window.__scenes.push(e.detail); else if (e?.detail) window.__scenes.push(e.detail) } } })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(5000)
  await page.evaluate(() => [...document.querySelectorAll('button')].filter(e => e.textContent.trim() === '3D' && e.offsetParent).pop()?.click()); await sleep(15000)
  const r = await page.evaluate(() => {
    const out = []
    for (const s of window.__scenes) {
      if (!s?.traverse) continue
      s.updateMatrixWorld?.(true)
      s.traverse(o => {
        if (!o.isMesh || o.name !== 'Sink') return
        const p = o.geometry.attributes.position, v = new o.position.constructor()
        let minY = Infinity; const pts = []
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); pts.push([v.x, v.y, v.z]); minY = Math.min(minY, v.y) }
        const xs = pts.map(q => q[0]), cx = (Math.min(...xs) + Math.max(...xs)) / 2
        const deep = pts.filter(q => q[1] < minY + 0.002 * 1000 * (minY > 10 ? 1 : 0.001) + 1e-6 || q[1] < minY + 2)
        const dx = deep.reduce((a, q) => a + q[0], 0) / deep.length
        out.push({ minY, cx, deepX: dx, span: [Math.min(...xs), Math.max(...xs)] })
      })
    }
    return out
  })
  console.log(JSON.stringify(r))
} finally { await browser.close() }
