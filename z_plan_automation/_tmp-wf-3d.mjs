// Temp: close-up 3D renders of a waterfall corner.  node _tmp-wf-3d.mjs <roomId> <outDir> <views JSON [[name,[cx,cy,cz],[tx,ty,tz]],...]>
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
const [ROOM, OUT, VIEWS] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1600, height: 1000 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  await page.evaluateOnNewDocument(() => {
    window.__objs = []
    window.__THREE_DEVTOOLS__ = { addEventListener() {}, dispatchEvent(e) { if (e.type === 'observe') window.__objs.push(e.detail) } }
  })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 90000 })
  await sleep(4000)
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === '3D'); b?.click() })
  await sleep(12000)
  for (const [name, cam, tgt] of JSON.parse(VIEWS)) {
    const url = await page.evaluate((cam, tgt) => {
      const scene = window.__objs.filter(o => o?.isScene).pop()
      const r = window.__objs.filter(o => o?.isWebGLRenderer).pop()
      if (!scene || !r) return 'no scene ' + window.__objs.length
      const Object3D = Object.getPrototypeOf(Object.getPrototypeOf(scene)).constructor
      const M4 = scene.matrix.constructor
      const cam3 = new Object3D()
      cam3.isCamera = true
      cam3.matrixWorldInverse = new M4(); cam3.projectionMatrix = new M4(); cam3.projectionMatrixInverse = new M4()
      cam3.position.set(...cam)
      cam3.lookAt(...tgt)
      cam3.updateMatrixWorld(true)
      cam3.matrixWorldInverse.copy(cam3.matrixWorld).invert()
      const near = 5, far = 50000, top = near * Math.tan(20 * Math.PI / 180), right = top * r.domElement.width / r.domElement.height
      cam3.projectionMatrix.makePerspective(-right, right, top, -top, near, far)
      cam3.projectionMatrixInverse.copy(cam3.projectionMatrix).invert()
      r.render(scene, cam3)
      return r.domElement.toDataURL('image/png')
    }, cam, tgt)
    if (!url.startsWith('data:')) { console.log(name, url); continue }
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'))
    console.log('saved', name)
  }
} finally { await browser.close() }
