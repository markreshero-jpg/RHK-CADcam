// Temp: dump resolved parts of cabinets.  node _tmp-parts.mjs <roomId> LABEL,LABEL
import puppeteer from 'puppeteer-core'
const [roomId, labels] = process.argv.slice(2)
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${roomId}`, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 30000 })
  await new Promise(r => setTimeout(r, 1500))
  for (const l of labels.split(',')) {
    const r = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    const parts = [...(r.case_parts||[]),...(r.custom_parts||[]),...(r.toekick_parts||[])]; console.log("  zones", JSON.stringify((r.face_zones||[]).map(z=>({t:z.face_type,x:z.x,y:z.y,w:z.dx??z.width,h:z.dy??z.height,z:z.z,hs:z.hinge_side}))))
    console.log('==', l, Object.keys(r).join(','))
    for (const p of (Array.isArray(parts) ? parts : [])) console.log(' ', p.part_key || p.name, JSON.stringify(p.edge_band), 'X', p.X?.toFixed?.(1), 'Y', p.Y, 'Z', p.Z?.toFixed?.(1), 'DX', p.DX?.toFixed?.(1), 'DY', p.DY?.toFixed?.(1), 'DZ', p.DZ, p.outline ? 'outline' + p.outline.length : '', p.bevel_lo ?? '', p.bevel_hi ?? '')
  }
} finally { await browser.close() }
