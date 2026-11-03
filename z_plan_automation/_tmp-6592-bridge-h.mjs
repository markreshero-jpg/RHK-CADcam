// Temp: run bridge steps on a room.  node _tmp-bridge.mjs <roomId> <steps.json>
// steps: [["method", [args...]], ...]  — prints each result, then getIssues.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
const [roomId, stepsPath] = process.argv.slice(2)
const steps = JSON.parse(fs.readFileSync(stepsPath, 'utf8'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0,300))); page.on('dialog', d => { console.log('dialog dismissed:', d.message()); d.dismiss() })
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${roomId}`, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 30000 })
  await sleep(1500)
  const api = (fn, args) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, args])
  for (const [fn, args] of steps) {
    if (fn === 'reload') { await page.reload({ waitUntil: 'networkidle2' }); await page.waitForFunction('!!window.__canvasApi'); await sleep(1500); console.log('reloaded'); continue }
    try { const r = await api(fn, args); console.log(fn, JSON.stringify(args), "->", fn === "getResolved" ? JSON.stringify(r.face_zones.filter(z => z.handle).map(z => [z.face_type, z.hinge_side, z.DX, z.DY, z.handle.grip_edge, z.handle.orientation, z.handle.grip_kind, z.handle.bore_centres, z.handle.x, z.handle.y, z.handle.name])) + " faces " + JSON.stringify(r.face_zones.filter(z => z.face_type !== "open").map(z => [z.face_type, z.hinge_side, z.DX, z.DY])) : JSON.stringify(fn === "getState" ? r.cabinets.map(c => [c.label, c.offset, c.dx, c.dy, c.dz]) : r)) }
    catch (e) { console.log(fn, 'FAILED', e.message.split('\n')[0]) }
    await sleep(600)
  }
  const issues = await api('getIssues', [])
  for (const c of issues) {
    console.log(`${c.errors.length ? 'ERROR' : c.warnings.length ? 'WARN ' : 'OK   '} ${c.label} ${c.dims}`)
    for (const e of c.errors) console.log(`   E ${e.code}: ${e.message}${e.part ? ` [${e.part}]` : ''}`)
    for (const w of c.warnings) console.log(`   W ${w.code}: ${w.message}${w.part ? ` [${w.part}]` : ''}`)
  }
} finally { await browser.close() }
