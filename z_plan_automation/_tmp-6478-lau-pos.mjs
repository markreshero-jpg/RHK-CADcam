// Dump world plan corners of Laundry fillers + walls (which end is the wall).
import puppeteer from 'puppeteer-core'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run','--disable-gpu'], protocolTimeout: 300000 })
const p = await b.newPage(); await p.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
await p.goto('http://localhost:3001/canvas/fc12bc7d-53ee-46ee-a302-3411f5129bcc', { waitUntil: 'domcontentloaded', timeout: 240000 })
await p.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(4000)
const out = await p.evaluate(() => {
  const st = window.__canvasApi.getState()
  return { keys: Object.keys(st.cabinets[0]), walls: st.walls?.map(w => ({ name: w.name, x1: w.x1 ?? w.start_x, y1: w.y1 ?? w.start_y, x2: w.x2 ?? w.end_x, y2: w.y2 ?? w.end_y, angle: w.angle, length: w.length })),
    cabs: st.cabinets.filter(c => ['TC-01','TC-09','TC-10','TC-11','BC-06','TC-06','TC-08','BC-07'].includes(c.label)).map(c => ({ label: c.label, x: c.x, y: c.y, world: c.world ?? c.corners ?? null, pos_x: c.pos_x, rot: c.rotation })) }
})
console.log(JSON.stringify(out, null, 1))
await b.close(); process.exit(0)
